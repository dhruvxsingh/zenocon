interface GeocodeResult {
  city: string;
  pincode: string;
  state?: string;
  country?: string;
  formatted_address?: string;
}

export class GeocodingService {
  private readonly apiKey: string;

  constructor() {
    this.apiKey = process.env.GOOGLE_MAPS_API_KEY || '';
  }

  async reverseGeocode(lat: number, lng: number): Promise<GeocodeResult> {
    if (!this.apiKey) {
      // Return mock data if no API key
      return this.getMockGeocode(lat, lng);
    }

    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${this.apiKey}`
      );
      
      const data = await response.json();
      
      if (data.status === 'OK' && data.results.length > 0) {
        const result = data.results[0];
        const components = result.address_components;
        
        let city = '';
        let pincode = '';
        let state = '';
        let country = '';
        
        for (const component of components) {
          if (component.types.includes('locality')) {
            city = component.long_name;
          }
          if (component.types.includes('postal_code')) {
            pincode = component.long_name;
          }
          if (component.types.includes('administrative_area_level_1')) {
            state = component.long_name;
          }
          if (component.types.includes('country')) {
            country = component.long_name;
          }
        }
        
        return {
          city,
          pincode,
          state,
          country,
          formatted_address: result.formatted_address
        };
      }
      
      return this.getMockGeocode(lat, lng);
    } catch (error) {
      console.error('Geocoding error:', error);
      return this.getMockGeocode(lat, lng);
    }
  }

  private getMockGeocode(lat: number, lng: number): GeocodeResult {
    // Mock data based on rough coordinates
    if (lat >= 18.9 && lat <= 19.3 && lng >= 72.7 && lng <= 73.1) {
      return { city: 'Mumbai', pincode: '400001', state: 'Maharashtra' };
    }
    if (lat >= 28.5 && lat <= 28.8 && lng >= 77.0 && lng <= 77.4) {
      return { city: 'Delhi', pincode: '110001', state: 'Delhi' };
    }
    if (lat >= 12.9 && lat <= 13.2 && lng >= 77.5 && lng <= 77.8) {
      return { city: 'Bangalore', pincode: '560001', state: 'Karnataka' };
    }
    
    // Default
    return { city: 'Unknown', pincode: '000000', state: 'Unknown' };
  }

  calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);
    
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  private toRad(degrees: number): number {
    return degrees * (Math.PI / 180);
  }
}