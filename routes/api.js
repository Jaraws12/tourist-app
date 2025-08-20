const express = require('express');
const router = express.Router();
const {authenticateToken} = require('../middlewares/authenticateToken');
const admin = require("../config/firebase");
const geolib = require('geolib');

const db = admin.firestore();


//toggle-tracking

router.post('/toggle-tracking', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }

    // 1️⃣ Fetch user doc
    const userRef = db.collection('users').doc(userId);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userData = userSnap.data();

    // 2️⃣ Toggle trackingEnabled
    const currentStatus = userData.trackingEnabled || false;
    const newStatus = !currentStatus;

    // 3️⃣ Update Firestore
    await userRef.update({
      trackingEnabled: newStatus
    });

    res.json({ 
      message: `Tracking ${newStatus ? 'enabled' : 'disabled'} for user`,
      trackingEnabled: newStatus
    });

  } catch (err) {
    console.error('Error toggling tracking:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});





//toggle-group-activation

router.post('/toggle-group-activation', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.body;

    if (!groupId) {
      return res.status(400).json({ error: 'Missing groupId' });
    }

    // 1️⃣ Fetch group
    const groupRef = db.collection('groups').doc(groupId);
    const groupSnap = await groupRef.get();

    if (!groupSnap.exists) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const groupData = groupSnap.data();

    // 2️⃣ Check if current user is admin
    if (!groupData.admin || groupData.admin !== req.user.id) {
      return res.status(403).json({ error: 'Only admin can toggle group' });
    }

    // 3️⃣ Negate ISactive (default false if not present)
    const currentStatus = groupData.ISactive || false;
    const newStatus = !currentStatus;

    // 4️⃣ Update Firestore
    await groupRef.update({ ISactive: newStatus });

    res.json({ 
      message: `Group ${newStatus ? 'activated' : 'deactivated'} successfully`,
      ISactive: newStatus
    });

  } catch (err) {
    console.error('Error toggling group:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});




//create group

router.post('/create-group', authenticateToken, async (req, res) => {
  try {
    const { groupName, adminPhone, subAdminPhone, memberPhones } = req.body;

    if (!groupName || !adminPhone || !Array.isArray(memberPhones)) {
      return res.status(400).json({ error: 'Invalid request payload' });
    }

    const usersRef = db.collection('users');

    // Fetch admin
    const adminSnapshot = await usersRef.where('phone', '==', adminPhone).get();
    if (adminSnapshot.empty) return res.status(404).json({ error: 'Admin not found' });
    const adminDoc = adminSnapshot.docs[0];

    // Fetch sub-admin (optional)
    let subAdminDoc = null;
    if (subAdminPhone) {
      const subAdminSnapshot = await usersRef.where('phone', '==', subAdminPhone).get();
      if (subAdminSnapshot.empty) return res.status(404).json({ error: 'Sub-admin not found' });
      subAdminDoc = subAdminSnapshot.docs[0];
    }

    // Fetch all members by phone
    const memberIds = [];
    for (const phone of memberPhones) {
      const snapshot = await usersRef.where('phone', '==', phone).get();
      if (snapshot.empty) return res.status(404).json({ error: `User with phone ${phone} not found` });
      memberIds.push(snapshot.docs[0].id);
    }

    // Add admin and sub-admin to members list if not already there
    if (!memberIds.includes(adminDoc.id)) memberIds.push(adminDoc.id);
    if (subAdminDoc && !memberIds.includes(subAdminDoc.id)) memberIds.push(subAdminDoc.id);

    // Create group object (store only IDs)
    const groupData = {
      groupName,
      admin: adminDoc.id,
      subAdmin: subAdminDoc ? subAdminDoc.id : null,
      ISactive: false, // initially inactive
      members: memberIds
    };

    // Save group to Firestore and get ID
    const groupRef = await db.collection('groups').add(groupData);
    const groupId = groupRef.id;

    // Update each member’s user document to store groupId
    const updatePromises = memberIds.map(userId =>
      usersRef.doc(userId).update({
        groups: admin.firestore.FieldValue.arrayUnion(groupId)
      })
    );
    await Promise.all(updatePromises);

    res.status(201).json({ message: 'Group created successfully', groupId, groupData });

  } catch (err) {
    console.error('Error creating group:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});



//updates location


router.post('/update-location',authenticateToken ,async (req, res) => {
  try {
    const { phone, latitude, longitude } = req.body;

    const userRef = db.collection('users').where('phone', '==', phone);
    const snap = await userRef.get();
    if (snap.empty) return res.status(404).json({ error: 'User not found' });

    const doc = snap.docs[0];
    const userData = doc.data();

    if (!userData.trackingEnabled) {
      return res.status(403).json({ error: 'User has disabled tracking' });
    }

    await db.collection('users').doc(doc.id).update({
      lastLocation: { latitude, longitude }
    });

    res.json({ message: 'Location updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});



///calculate distance

router.post('/calculate-distance', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }

    // 1️⃣ Get the user doc
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userData = userDoc.data();
    console.log('User Data:', userData);

    if (!userData.groups || !Array.isArray(userData.groups) || userData.groups.length === 0) {
      return res.status(200).json({ message: 'User is not in any groups' });
    }

    if (!userData.lastLocation) {
      return res.status(400).json({ error: 'User location not found' });
    }

    const notifications = [];

    // 2️⃣ Loop through groups
    for (const groupId of userData.groups) {
      const groupDoc = await db.collection('groups').doc(groupId).get();
      if (!groupDoc.exists) continue;

      const groupData = groupDoc.data();
      console.log('Group Data:', groupData);

      // Skip inactive groups
      if (!groupData.ISactive) continue;

      // ✅ Fetch admin info from users collection
      const adminId = groupData.admin; // admin is just the userId
      if (!adminId) continue;

      const adminDoc = await db.collection('users').doc(adminId).get();
      if (!adminDoc.exists) continue;

      const adminData = adminDoc.data();
      console.log('Admin Data:', adminData);

      if (!adminData.lastLocation) continue;

      // 3️⃣ Calculate distance
      const distance = geolib.getDistance(
        { latitude: userData.lastLocation.latitude, longitude: userData.lastLocation.longitude },
        { latitude: adminData.lastLocation.latitude, longitude: adminData.lastLocation.longitude }
      );

      if (distance > 7000) {
        const km = (distance / 1000).toFixed(2);
        const msg = `${userData.username || 'A member'} is ${km} km away from you in group ${groupData.groupName}`;

        // Store notification in Firestore (optional)
        await db.collection('notifications').add({
          to: adminData.phone,
          message: msg,
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        notifications.push({ groupId, message: msg });
      }
    }

    res.json({ message: 'Distance check complete', notifications });

  } catch (error) {
    console.error('Error calculating distance:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


//solo-toggle
router.post('/toggle-solo', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }

    // 1️⃣ Fetch user doc
    const userRef = db.collection('users').doc(userId);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userData = userSnap.data();

    // 2️⃣ Toggle isSolo
    const currentStatus = userData.isSolo || false;
    const newStatus = !currentStatus;

    // 3️⃣ Update Firestore
    await userRef.update({
      Issolo: newStatus
    });

    res.json({ 
      message: `Solo mode ${newStatus ? 'enabled' : 'disabled'} for user`,
      isSolo: newStatus
    });

  } catch (err) {
    console.error('Error toggling solo mode:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


//add-location

router.post('/add-locations', async (req, res) => {
  try {
    const locations = req.body.locations; // expecting array

    if (!Array.isArray(locations) || locations.length === 0) {
      return res.status(400).json({ error: 'Invalid or empty locations list' });
    }

    // Validate each entry
    for (const loc of locations) {
      if (!loc.name || !loc.latitude || !loc.longitude || !loc.openTime || !loc.closeTime) {
        return res.status(400).json({ error: 'Each location must have name, latitude, longitude, openTime, and closeTime' });
      }
    }

    const batch = db.batch();

    locations.forEach(loc => {
      const newDocRef = db.collection('imp_locations').doc();
      batch.set(newDocRef, {
        name: loc.name,
        latitude: loc.latitude,
        longitude: loc.longitude,
        openTime: loc.openTime,
        closeTime: loc.closeTime,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    });

    await batch.commit();

    res.status(201).json({ message: 'Locations added successfully', count: locations.length });

  } catch (err) {
    console.error('Error adding locations:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});




//check-nearby-places


router.get('/check-nearby-places', async (req, res) => {
  try {
    // You can take userId from query params or JWT
    const { userId } = req.query; 

    if (!userId) {
      return res.status(400).json({ error: "Missing userId" });
    }

    // Fetch the user
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: "User not found" });
    }

    const userData = userDoc.data();
    if (!userData.trackingEnabled || !userData.lastLocation) {
      return res.json({ message: "Tracking not enabled or no location set" });
    }

    // Fetch important locations
    const snapshot = await db.collection('imp_locations').get();
    let nearbyPlaces = [];

    snapshot.forEach(doc => {
      const loc = doc.data();
      const distance = geolib.getDistance(
        { latitude: userData.lastLocation.latitude, longitude: userData.lastLocation.longitude },
        { latitude: loc.latitude, longitude: loc.longitude }
      );

      if (distance <= 40000) {
        nearbyPlaces.push({
          name: loc.name,
          distanceInKm: (distance / 1000).toFixed(2),
          openTime: loc.openTime,
          closeTime: loc.closeTime
        });
      }
    });

    // Optional: Store notifications
    for (const place of nearbyPlaces) {
      await db.collection('notifications').add({
        to: userData.phone,
        message: `You are ${place.distanceInKm} km away from ${place.name}. Open: ${place.openTime} - ${place.closeTime}`,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    res.json({ nearbyPlaces });

  } catch (err) {
    console.error("Error in nearby check:", err);
    res.status(500).json({ error: "Server error" });
  }
});





//solo- check
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of Earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
}

// Find solo travellers around 20 km
// router.get('/find-solo-travellers', authenticateToken, async (req, res) => {
//   try {
//     const userId = req.user.id; // Assuming authenticateToken sets req.user.id



//     // 1. Get current user's data
//     const userDoc = await db.collection('users').doc(userId).get();
//     if (!userDoc.exists) {
//       return res.status(404).json({ error: 'User not found' });
//     }

//     const userData = userDoc.data();
//     if (
//       !userData.lastLocation ||
//       !userData.lastLocation.latitude ||
//       !userData.lastLocation.longitude
//     ) {
//       return res.status(400).json({ error: 'User location not found' });
//     }

//     const userLat = userData.lastLocation.latitude;
//     const userLng = userData.lastLocation.longitude;

//     // 2. Get all solo travellers
//     const snapshot = await db.collection('users')
//       .where('Issolo', '==', true)
//       .get();

//     if (snapshot.empty) {
//       return res.json({ nearbyTravellers: [] });
//     }

//     // 3. Filter by 20 km radius
//     const nearbyTravellers = [];
//     snapshot.forEach(doc => {
//       if (doc.id === userId) return; // skip self
//       const data = doc.data();

//       if (
//         data.lastLocation &&
//         data.lastLocation.latitude &&
//         data.lastLocation.longitude
//       ) {
//         const distance = getDistanceFromLatLonInKm(
//           userLat, userLng,
//           data.lastLocation.latitude, data.lastLocation.longitude
//         );

//         if (distance <= 20) {
//           nearbyTravellers.push({
//             id: doc.id,
//             name: data.name,
//             phone: data.phone,
//             distance: Number(distance.toFixed(2))
//           });
//         }
//       }
//     });

//     // 4. Return nearby solo travellers
//     res.json({
//       message: 'Nearby solo travellers within 20 km',
//       nearbyTravellers
//     });

//   } catch (err) {
//     console.error('Error finding solo travellers:', err);
//     res.status(500).json({ error: 'Internal server error' });
//   }
// });


router.get('/find-solo-travellers', authenticateToken, async (req, res) => {
  try {
    const { userId, latitude, longitude } = req.query; 
    // If frontend sends via query params ?userId=..&latitude=..&longitude=..
    // OR use req.body if it’s a POST request

    // 1. Validate input
    if (!userId || !latitude || !longitude) {
      return res.status(400).json({ error: 'userId, latitude and longitude are required' });
    }

    const userLat = parseFloat(latitude);
    const userLng = parseFloat(longitude);

    // 2. Get all solo travellers
    const snapshot = await db.collection('users')
      .where('Issolo', '==', true)
      .get();

    if (snapshot.empty) {
      return res.json({ nearbyTravellers: [] });
    }

    // 3. Filter by 20 km radius
    const nearbyTravellers = [];
    snapshot.forEach(doc => {
      if (doc.id === userId) return; // skip self
      const data = doc.data();

      if (
        data.lastLocation &&
        data.lastLocation.latitude &&
        data.lastLocation.longitude
      ) {
        const distance = getDistanceFromLatLonInKm(
          userLat, userLng,
          data.lastLocation.latitude, data.lastLocation.longitude
        );

        if (distance <= 20) {
          nearbyTravellers.push({
            id: doc.id,
            name: data.name,
            phone: data.phone,
            distance: Number(distance.toFixed(2))
          });
        }
      }
    });

    // 4. Return nearby solo travellers
    res.json({
      message: 'Nearby solo travellers within 20 km',
      nearbyTravellers
    });

  } catch (err) {
    console.error('Error finding solo travellers:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});




module.exports = router;






