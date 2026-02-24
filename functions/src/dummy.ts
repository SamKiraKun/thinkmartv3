import * as functions from 'firebase-functions';

export const dummyFunc = functions.https.onRequest((req, res) => {
    res.send('ok');
});
