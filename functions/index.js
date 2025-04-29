const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { Timestamp } = require("firebase-admin/firestore");

admin.initializeApp();
const db = admin.firestore();

exports.getBooksAfterDate = functions.https.onRequest({}, async (req, res) => {
  try {
    if (
      (!req.headers.authorization || !req.headers.authorization.startsWith("Bearer ")) &&
      !(req.cookies && req.cookies.__session)
    ) {
      console.error(
        "No Firebase ID token was passed as a Bearer token in the Authorization header.",
        "Make sure you authorize your request by providing the following HTTP header:",
        "Authorization: Bearer <Firebase ID Token>",
        'or by passing a "__session" cookie.'
      );
      return res.status(403).json({ error: "Unauthorized" });
    }

    let idToken;
    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
      // Read the ID Token from the Authorization header.
      idToken = req.headers.authorization.split("Bearer ")[1];
    } else if (req.cookies) {
      // Read the ID Token from cookie.
      idToken = req.cookies.__session;
    } else {
      // No authorization
      return res.status(403).json({ error: "Unauthorized" });
    }
    try {
      decodedIdToken = await admin.auth().verifyIdToken(idToken);
    } catch (authError) {
      console.error("Failed to verify ID token:", authError);
      return res
        .status(403)
        .json({ error: "Unauthorized - invalid or expired ID token." });
    }
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
      userEmail: decodedIdToken.email,
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
