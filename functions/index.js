const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { Timestamp } = require("firebase-admin/firestore");

admin.initializeApp();
const db = admin.firestore();

exports.getBooksAfterDate = functions.https.onRequest({}, async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ error: "Missing 'date' parameter." });
    }

    const queryDate = new Date(date);
    if (isNaN(queryDate)) {
      return res.status(400).json({ error: "Invalid date format." });
    }
    const ts = Timestamp.fromDate(queryDate);

    // 1) recentlyCreated: createdAt > queryDate
    const createdSnap = await db
      .collection("books")
      .where("createdAt", ">", ts)
      .orderBy("createdAt", "asc")
      .get();

    // 2) recentlyUpdated: updatedAt > queryDate AND createdAt <= queryDate
    const updatedSnap = await db
      .collection("books")
      .where("updatedAt", ">", ts)
      .where("createdAt", "<=", ts)
      .orderBy("updatedAt", "asc")
      .get();

    // map helper to convert Timestamps → ISO
    const mapDoc = (doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        title: data.title,
        author: data.author,
        createdAt: data.createdAt.toDate().toISOString(),
        updatedAt: data.updatedAt.toDate().toISOString(),
        // any other fields can be spread here...
        ...Object.fromEntries(
          Object.entries(data).filter(([k]) => k !== "createdAt" && k !== "updatedAt")
        ),
      };
    };

    const recentlyCreatedData = createdSnap.docs.map(mapDoc);
    const recentlyUpdatedData = updatedSnap.docs.map(mapDoc);

    // lastSyncedOn = now
    const lastSyncedOn = new Date().toISOString();

    return res.status(200).json({
      lastSyncedOn,
      countUpdatedData: recentlyUpdatedData.length,
      countCreatedData: recentlyCreatedData.length,
      recentlyCreatedData,
      recentlyUpdatedData,
    });
  } catch (err) {
    console.error("getBooksAfterDate error:", err);
    return res.status(500).json({ error: "Internal server error." });
  }
});
