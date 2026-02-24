import { apiClient } from '@/lib/api/client';

export async function purchaseMembership(): Promise<{ success: boolean; activatedAt: string }> {
    const res = await apiClient.post<{ data: { success: boolean; activatedAt: string } }>(
        '/api/membership/purchase',
        {}
    );
    return res.data;
}

