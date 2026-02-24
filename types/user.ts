// File: ThinkMart/types/user.ts
import { Timestamp } from 'firebase/firestore';

export type UserRole = 'user' | 'admin' | 'partner' | 'vendor' | 'sub_admin' | 'organization';

/**
 * UserProfile represents the 'users' collection in Firestore.
 * * CHANGES FROM OLD INTERFACE:
 * 1. Removed 'balance' & 'coins': These are now in the 'wallets' collection for security.
 * 2. Renamed 'displayName' -> 'name': Matches the registration form.
 * 3. Added 'ownReferralCode': This is the code the user SHARES.
 * 4. Added 'referralCode': This is the code the user ENTERED (their upline).
 * 5. Added 'city'/'state': Essential for the Partner system.
 */
export interface UserProfile {
  uid: string; // Primary Key (matches Auth UID)
  email: string;
  name: string;
  phone?: string;
  photoURL?: string;
  role: UserRole;

  // Location Data (Crucial for City Partners)
  state?: string;
  city?: string;

  // MLM & Referral System
  ownReferralCode: string;      // <--- The code this user shares to invite others
  referralCode?: string | null; // <--- The upline's code they used to register
  referredBy?: string | null;   // <--- The UID of the upline (calculated by Cloud Function)
  uplinePath?: string[];        // <--- Array of UIDs for 6-level calculation
  referralProcessed?: boolean;  // <--- Idempotency flag for Cloud Functions

  // Membership Status
  membershipActive: boolean;    // <--- True if they paid the ₹1000 fee
  membershipDate?: Timestamp;

  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
  isActive: boolean;
  isBanned?: boolean;

  // KYC (Know Your Customer) Verification
  kycStatus?: 'not_submitted' | 'pending' | 'verified' | 'rejected';
  kycData?: {
    fullName: string;
    dateOfBirth: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
    idType: string;
    idNumber: string;
    bankName: string;
    accountNumber: string;
    ifscCode: string;
  };
  kycSubmittedAt?: Timestamp;
  kycVerifiedAt?: Timestamp;
  kycRejectionReason?: string;

  // Shopping Data
  savedAddresses?: SavedAddress[];
  paymentMethods?: {
    upi?: string;
    bank?: {
      accountNo?: string;
      ifsc?: string;
    };
  };

  // Partner Configuration (for role === 'partner')
  // Each partner is assigned ONE city with ONE commission percentage
  partnerConfig?: {
    assignedCity: string;          // Single city assignment
    commissionPercentage: number;  // Partner's % of the 20% pool (e.g., 5 means 5%)
    assignedAt?: Timestamp;
    assignedBy?: string;           // Admin UID who assigned
  };

  // Vendor Configuration (for role === 'vendor')
  vendorConfig?: {
    vendorId: string;              // Unique vendor identifier
    businessName: string;          // Vendor business name
    verified: boolean;             // Whether vendor is verified
    createdAt?: Timestamp;
  };

  // Sub-Admin Permissions (for role === 'sub_admin')
  subAdminPermissions?: string[];  // e.g., ['manage_users', 'view_analytics']
}

// Address Interface
export interface SavedAddress {
  id: string;
  fullName: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  pincode: string;
  isDefault?: boolean;
}

// Helper: Compatibility type if you have legacy code using 'User'
// It is recommended to switch to 'UserProfile' to distinguish from Firebase Auth User
export type User = UserProfile;

// Helper: Check if user profile is complete
export const isUserSetup = (user: UserProfile): boolean => {
  return !!(user.ownReferralCode && user.city && user.state);
};
