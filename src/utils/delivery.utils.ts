import { Address } from '@/types/customer'; 
interface DeliveryZone {
  pincode: string;
  area: string;
  charge: number;
  minOrder: number;
  estimatedTime: string;
  available: boolean;
}

export class DeliveryUtils {
  private static deliveryZones: DeliveryZone[] = [
    { pincode: '400001', area: 'Fort', charge: 30, minOrder: 200, estimatedTime: '30-40 mins', available: true },
    { pincode: '400002', area: 'Kalbadevi', charge: 35, minOrder: 200, estimatedTime: '35-45 mins', available: true },
    { pincode: '400003', area: 'Marine Lines', charge: 40, minOrder: 250, estimatedTime: '40-50 mins', available: true },
    { pincode: '400004', area: 'Girgaon', charge: 35, minOrder: 200, estimatedTime: '35-45 mins', available: true },
    { pincode: '400005', area: 'Colaba', charge: 45, minOrder: 300, estimatedTime: '45-55 mins', available: true },
    // Add more zones as needed
  ];

  static async checkDeliveryAvailability(address: Partial<Address>): Promise<{
    available: boolean;
    charge: number;
    minOrder: number;
    estimatedTime: string;
    reason?: string;
  }> {
    const pincode = address.pincode || '';
    
    // Check pincode-based delivery
    const zone = this.deliveryZones.find(z => z.pincode === pincode);
    
    if (zone) {
      return {
        available: zone.available,
        charge: zone.charge,
        minOrder: zone.minOrder,
        estimatedTime: zone.estimatedTime,
        reason: zone.available ? undefined : 'Service temporarily unavailable in this area'
      };
    }

    // Check coordinates-based delivery (if pincode not found)
    if (address.coordinates) {
      const distance = this.calculateDistanceFromRestaurant(
        address.coordinates.latitude,
        address.coordinates.longitude
      );
      
      if (distance <= 5) { // 5km radius
        return {
          available: true,
          charge: Math.ceil(distance * 10), // ₹10 per km
          minOrder: 200,
          estimatedTime: `${Math.ceil(distance * 10)}-${Math.ceil(distance * 10) + 10} mins`
        };
      } else {
        return {
          available: false,
          charge: 0,
          minOrder: 0,
          estimatedTime: '',
          reason: 'Location is outside our delivery radius (5km)'
        };
      }
    }

    return {
      available: false,
      charge: 0,
      minOrder: 0,
      estimatedTime: '',
      reason: 'Unable to verify delivery availability for this address'
    };
  }

  private static calculateDistanceFromRestaurant(lat: number, lng: number): number {
    // Restaurant coordinates (example: Mumbai location)
    const RESTAURANT_LAT = 19.0760;
    const RESTAURANT_LNG = 72.8777;
    
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(lat - RESTAURANT_LAT);
    const dLng = this.toRad(lng - RESTAURANT_LNG);
    
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(this.toRad(RESTAURANT_LAT)) * Math.cos(this.toRad(lat)) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  private static toRad(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  static formatDeliveryInfo(info: any): string {
    let message = '';
    
    if (info.available) {
      message += `✅ Delivery available to your location\n`;
      message += `🚚 Delivery charge: ₹${info.charge}\n`;
      message += `📦 Minimum order: ₹${info.minOrder}\n`;
      message += `⏱️ Estimated time: ${info.estimatedTime}`;
    } else {
      message += `❌ ${info.reason || 'Delivery not available to this location'}`;
    }
    
    return message;
  }
}