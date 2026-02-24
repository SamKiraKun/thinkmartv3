
const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json'); // User needs to provide this or we rely on default creds if env is set

// We'll try to use default app if already initialized, or init
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.applicationDefault()
    });
}

const db = admin.firestore();

async function checkTasks() {
    console.log('Checking tasks...');
    const snapshot = await db.collection('tasks').get();
    if (snapshot.empty) {
        console.log('No tasks found in "tasks" collection.');
        return;
    }

    snapshot.forEach(doc => {
        const data = doc.data();
        console.log(`Task ID: ${doc.id}`);
        console.log(`- Title: ${data.title}`);
        console.log(`- Type: ${data.type}`);
        console.log(`- isActive: ${data.isActive} (${typeof data.isActive})`);
        console.log(`- Valid for Query? ${data.isActive === true}`);
        console.log('---');
    });
}

checkTasks().catch(console.error);
