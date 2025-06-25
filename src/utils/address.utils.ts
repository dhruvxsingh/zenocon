import { Address } from '@/types/customer';

export class AddressUtils {
  static formatAddress(address: Address): string {
    let formatted = address.street;
    if (address.landmark) formatted += `, ${address.landmark}`;
    formatted += `\n${address.city} - ${address.pincode}`;
    return formatted;
  }

  static parseAddress(text: string): Partial<Address> {
    const pincodeMatch = text.match(/\b\d{6}\b/);
    const cityPatterns = [
      'mumbai', 'delhi', 'bangalore', 'chennai', 'kolkata',
      'pune', 'hyderabad', 'ahmedabad', 'surat', 'jaipur'
    ];
    
    let city = '';
    for (const pattern of cityPatterns) {
      if (text.toLowerCase().includes(pattern)) {
        city = pattern.charAt(0).toUpperCase() + pattern.slice(1);
        break;
      }
    }

    // Extract street/area
    const streetMatch = text.match(/(?:street|road|lane|marg|nagar|colony|park|society|complex|apartment|building)\s*[^,\n]*/i);
    const street = streetMatch ? streetMatch[0] : text.split(',')[0]?.trim() || text.substring(0, 50);

    return {
      street,
      city: city || 'Unknown',
      pincode: pincodeMatch ? pincodeMatch[0] : ''
    };
  }

  static parseAddressDetails(details: string): any {
    const lower = details.toLowerCase();
    const result: any = {};

    // Extract building/house number
    const buildingPatterns = [
      /(?:building|bldg|house|flat|apt|apartment)?\s*(?:no\.?|number|#)?\s*(\d+[\w\-\/]*)/i,
      /^(\d+[\w\-\/]*)\s+/,
      /\b(\w+\s+(?:tower|complex|apartment|society|building))\b/i
    ];
    
    for (const pattern of buildingPatterns) {
      const match = details.match(pattern);
      if (match) {
        result.building = match[1];
        break;
      }
    }

    // Extract floor
    const floorMatch = details.match(/(\d+)(?:st|nd|rd|th)?\s*floor/i);
    if (floorMatch) result.floor = floorMatch[1];

    // Extract landmark
    const landmarkKeywords = ['near', 'opposite', 'opp', 'behind', 'next to', 'beside', 'above', 'below'];
    for (const keyword of landmarkKeywords) {
      const regex = new RegExp(`${keyword}\\s+([^,\\.]+)`, 'i');
      const match = details.match(regex);
      if (match) {
        result.landmark = match[1].trim();
        break;
      }
    }

    // If no specific parsing worked, use the whole text
    if (!result.building && !result.landmark) {
      result.building = details;
    }

    return result;
  }

  static validatePincode(pincode: string): boolean {
    // Indian pincode validation
    return /^\d{6}$/.test(pincode);
  }

  static isAddressComplete(address: Partial<Address>): boolean {
    return !!(address.street && address.city && address.pincode);
  }
}