const fs = require('fs');
const file = 'app/dashboard/user/withdraw/page.tsx';
let data = fs.readFileSync(file, 'utf8');

// replace imports
data = data.replace(
    /import \{ useAuth \} from '@\/hooks\/useAuth';/,
    "import { useAuth } from '@/hooks/useAuth';\nimport { shouldUseApiRead } from '@/lib/featureFlags';\nimport { apiClient } from '@/lib/api/client';"
);

// replace useEffect for withdrawals
const searchHook = /useEffect\(\(\) => \{\r?\n    if \(\!user\) return;\r?\n\r?\n    const q = query\(\r?\n      collection\(db, 'withdrawals'\),\r?\n      where\('userId', '==', user\.uid\),\r?\n      orderBy\('createdAt', 'desc'\)\r?\n    \);\r?\n\r?\n    const unsub = onSnapshot\(q, \(snap\) => \{\r?\n      setHistory\(snap\.docs\.map\(\(d\) => \(\{ id: d\.id, \.\.\.d\.data\(\) \} as WithdrawalHistoryItem\)\)\);\r?\n    \}\);\r?\n\r?\n    return \(\) => unsub\(\);\r?\n  \}, \[user\]\);/;

const replaceHook = `useEffect(() => {
    if (!user) return;
    
    let active = true;
    let unsubscribe = () => {};
    let intervalId: NodeJS.Timeout;

    if (shouldUseApiRead('withdrawals')) {
        const fetchHistory = async () => {
            try {
                const res = await apiClient.get<any>('/api/withdrawals/history');
                if (active) {
                    setHistory(res.data.data || res.data);
                }
            } catch (error) {
                console.error('Withdrawals fetch error:', error);
            }
        };
        
        fetchHistory();
        intervalId = setInterval(fetchHistory, 15000); // 15-second polling
        
        unsubscribe = () => {
            active = false;
            clearInterval(intervalId);
        };
    } else {
        const q = query(
          collection(db, 'withdrawals'),
          where('userId', '==', user.uid),
          orderBy('createdAt', 'desc')
        );

        const fbUnsub = onSnapshot(q, (snap) => {
          setHistory(snap.docs.map((d) => ({ id: d.id, ...d.data() } as WithdrawalHistoryItem)));
        });
        
        unsubscribe = () => {
            active = false;
            fbUnsub();
        };
    }

    return () => unsubscribe();
  }, [user]);`;

data = data.replace(searchHook, replaceHook);
fs.writeFileSync(file, data);
console.log('Script ran successfully');
