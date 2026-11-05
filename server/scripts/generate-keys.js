import webpush from 'web-push';

const { publicKey, privateKey } = webpush.generateVAPIDKeys();

console.log('Add these as environment variables on your host:\n');
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log('VAPID_SUBJECT=mailto:you@example.com   # use your own email or an https:// URL');
console.log('\nKeep the private key secret. Do not change the pair later, or existing subscriptions stop working.');
