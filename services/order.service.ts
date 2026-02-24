import { createOrder as createOrderViaApi } from '@/services/orderService';
import { Product } from '@/types/product';

interface ShippingAddress {
  fullName: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  pincode: string;
}

export const orderService = {
  async createOrder(
    _userId: string,
    product: Product,
    paymentMethod: 'balance' | 'coins',
    shippingAddress: ShippingAddress
  ) {
    try {
      const coinsRedeemed = paymentMethod === 'coins' ? Math.floor(product.coinPrice ?? 0) : 0;
      const cashPaid = paymentMethod === 'balance' ? Number(product.price || 0) : 0;

      const result = await createOrderViaApi({
        items: [
          {
            productId: product.id,
            quantity: 1,
            price: Number(product.price || 0),
            coinPrice: Number(product.coinPrice || 0),
            isCoinOnly: Boolean(product.coinOnly),
            isCashOnly: Boolean(product.cashOnly),
            productName: product.name,
            productImage: product.images?.[0] || product.image,
            unitPrice: Number(product.price || 0),
          } as any,
        ],
        shippingAddress,
        subtotal: Number(product.price || 0),
        cashPaid,
        coinsRedeemed,
        coinValue: Number((coinsRedeemed / 1000).toFixed(3)),
      });

      return { success: true, orderId: result.id };
    } catch (error: unknown) {
      console.error('Order Failed:', error);
      const message = error instanceof Error ? error.message : 'Order processing failed';
      throw message;
    }
  },
};
