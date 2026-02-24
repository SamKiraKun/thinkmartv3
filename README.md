# EcoEarn - MLM Shopping Platform

A production-ready MLM (Multi-Level Marketing) + Shopping Platform built with **Next.js 14** and **Firebase**.

## Features

- 🔐 Role-based access control (User, Partner, Admin)
- 💰 Wallet system with balance and coins
- 👥 MLM referral system
- 🎁 Daily tasks, spin wheel, lucky box
- 🛍️ Shopping integration
- 📊 Admin analytics and management
- 💳 Withdrawal system
- 📱 Responsive design with Tailwind CSS

## Tech Stack

- **Frontend**: Next.js 14 (App Router)
- **Database**: Firebase Firestore
- **Auth**: Firebase Authentication
- **Storage**: Firebase Cloud Storage
- **State Management**: Zustand
- **Styling**: Tailwind CSS
- **Backend Logic**: Firebase Cloud Functions

## Project Structure

```
/mlm-shopping-platform
├── /app              # Next.js App Router pages
├── /components       # Reusable React components
├── /firebase         # Firebase configuration & SDK
├── /lib              # Business logic & utilities
├── /hooks            # Custom React hooks
├── /services         # API abstraction layer
├── /types            # TypeScript types
├── /store            # Global state management
├── /styles           # CSS files
├── /public           # Static assets
├── /functions        # Firebase Cloud Functions
└── /middleware.ts    # Route protection
```

## Installation

```bash
# Install dependencies
npm install

# Create .env.local with your Firebase config
cp .env.example .env.local

# Run development server
npm run dev

# Build for production
npm build

# Start production server
npm start
```

## Environment Variables

Create a `.env.local` file:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

## Database Schema

### Collections

- **users** - User profiles with roles
- **wallets** - User balance and coins
- **transactions** - Transaction history
- **tasks** - Available tasks
- **task_completions** - User task completions
- **products** - Shop products
- **withdrawals** - Withdrawal requests
- **mlm_tree** - MLM structure data

## Security Rules

See `firestore.rules` and `storage.rules` for Firebase security configuration.

## Testing

Run standard tests:

```bash
npm test
```

Run Firestore security rules tests with emulator:

```bash
npm run test:rules
```

Notes:
- `tests/firestore.rules.test.ts` is emulator-gated and is skipped when `FIRESTORE_EMULATOR_HOST` is not present.
- Use `npm run test:rules` in CI so rules tests run against the Firestore emulator.

## Deployment

Deploy to Vercel:

```bash
vercel deploy
```

Deploy Firebase Functions:

```bash
cd functions
npm install
firebase deploy --only functions
```

## License

MIT

## Support

For support, email support@ecomearn.com
