const fs = require('fs');
const file = 'app/dashboard/user/orders/page.tsx';
let data = fs.readFileSync(file, 'utf8');

// replace imports
data = data.replace(
    /import \{ useAuth \} from '@\/hooks\/useAuth';/,
    "import { useAuth } from '@/hooks/useAuth';\nimport { shouldUseApiRead } from '@/lib/featureFlags';\nimport { apiClient } from '@/lib/api/client';"
);

// replace useEffect
const searchHook = /useEffect\(\(\) => \{\r?\n        if \(\!user\?\.uid\) return;\r?\n\r?\n        const ordersRef = collection\(db, 'orders'\);[\s\S]*?return \(\) => unsubscribe\(\);\r?\n    \}, \[user\?\.uid\]\);/;

const replaceHook = `useEffect(() => {
        if (!user?.uid) return;
        
        let active = true;
        let unsubscribe = () => {};
        let intervalId: NodeJS.Timeout;

        if (shouldUseApiRead('orders')) {
            const fetchOrders = async () => {
                try {
                    const res = await apiClient.get<any>('/api/orders');
                    if (active) {
                        setOrders(res.data.data || res.data);
                        setLoading(false);
                    }
                } catch (error) {
                    console.error('Orders fetch error:', error);
                    if (active) setLoading(false);
                }
            };
            
            fetchOrders();
            intervalId = setInterval(fetchOrders, 15000); // 15-second polling
            
            unsubscribe = () => {
                active = false;
                clearInterval(intervalId);
            };
        } else {
            const ordersRef = collection(db, 'orders');
            let q = query(
                ordersRef,
                where('userId', '==', user.uid),
                orderBy('createdAt', 'desc'),
                limit(50)
            );

            const fbUnsub = onSnapshot(q, (snapshot) => {
                const orderData = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                })) as Order[];
                setOrders(orderData);
                setLoading(false);
            }, (error) => {
                console.error('Orders fetch error:', error);
                setLoading(false);
            });
            
            unsubscribe = () => {
                active = false;
                fbUnsub();
            };
        }

        return () => unsubscribe();
    }, [user?.uid]);`;

data = data.replace(searchHook, replaceHook);
fs.writeFileSync(file, data);
console.log('Script ran successfully');
