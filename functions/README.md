# Firebase Cloud Functions

Cloud Functions for secure backend operations:

- `onRegister` - Handle user registration
- `assignUpline` - MLM tree assignment
- `distributeIncome` - Distribute MLM commissions
- `creditCoins` - Add coins to wallet
- `convertCoins` - Convert coins to balance
- `processWithdrawal` - Handle withdrawals
- `completeTask` - Record task completion
- `banUser` - Admin: ban user
- `exportData` - Admin: export data

## Deploying Functions

```bash
cd functions
npm install
firebase deploy --only functions
```

## Security

All sensitive operations must be in Cloud Functions:
- Direct wallet updates
- MLM distribution
- Withdrawal processing
- Task reward distribution
