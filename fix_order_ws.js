const fs = require('fs');
const file = 'app/dashboard/user/orders/[id]/page.tsx';
let data = fs.readFileSync(file, 'utf8');

// replace imports
data = data.replace(
    /import \{ useAuth \} from '@\/hooks\/useAuth';/,
    "import { useAuth } from '@/hooks/useAuth';\nimport { shouldUseApiRead, featureFlags } from '@/lib/featureFlags';\nimport { apiClient } from '@/lib/api/client';"
);

// replace useEffect
const searchHook = /useEffect\(\(\) => \{\r?\n        if \(\!orderId\) return;\r?\n\r?\n        const orderRef = doc\(db, 'orders', orderId\);[\s\S]*?return \(\) => unsubscribe\(\);\r?\n    \}, \[orderId, user\?\.uid, router\]\);/;

const replaceHook = `useEffect(() => {
        if (!orderId) return;

        let active = true;
        let ws: WebSocket | null = null;
        let unsubscribe = () => {};

        if (shouldUseApiRead('orders')) {
            const fetchOrder = async () => {
                try {
                    const res = await apiClient.get<any>(\`/api/orders/\${orderId}\`);
                    if (active) {
                        const data = res.data.data || res.data;
                        if (data.userId === user?.uid) {
                            setOrder({ id: data.id, ...data } as Order);
                        } else {
                            router.push('/dashboard/user/orders');
                        }
                        setLoading(false);
                    }
                } catch (err) {
                    if (active) {
                        setNotice({ type: 'error', text: 'Failed to fetch order.' });
                        router.push('/dashboard/user/orders');
                    }
                }
            };
            
            fetchOrder();
            
            if (featureFlags.realtimeEnabled) {
                let wsUrl = process.env.NEXT_PUBLIC_API_URL?.replace('http', 'ws') || 'ws://localhost:3001';
                if (!wsUrl.endsWith('/')) wsUrl += '/';
                wsUrl += 'api/ws/realtime';
                
                ws = new WebSocket(wsUrl);

                ws.onopen = () => {
                    ws?.send(JSON.stringify({
                        type: 'subscribe',
                        payload: { rooms: [\`order:\${orderId}\`] }
                    }));
                };

                ws.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        if (data.type === 'order_update' && data.payload) {
                            setOrder(prev => prev ? { ...prev, ...data.payload } : { id: orderId, ...data.payload } as Order);
                        }
                    } catch (err) {}
                };
            }
            
            unsubscribe = () => {
                active = false;
                if (ws) ws.close();
            };
        } else {
            const orderRef = doc(db, 'orders', orderId);
            const fbUnsub = onSnapshot(orderRef, (snapshot) => {
                if (snapshot.exists()) {
                    const data = snapshot.data();
                    if (data.userId === user?.uid) {
                        setOrder({ id: snapshot.id, ...data } as Order);
                    } else {
                        router.push('/dashboard/user/orders');
                    }
                } else {
                    router.push('/dashboard/user/orders');
                }
                setLoading(false);
            });
            unsubscribe = () => {
                active = false;
                fbUnsub();
            }
        }

        return () => unsubscribe();
    }, [orderId, user?.uid, router]);`;

data = data.replace(searchHook, replaceHook);
fs.writeFileSync(file, data);
console.log('Script ran successfully');
