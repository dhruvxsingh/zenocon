export interface Address {
  street: string;
  city: string;
  pincode: string;
  landmark?: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  type: 'home' | 'work' | 'other';
  isDefault: boolean;
}

export interface Customer {
  phone: string;
  name?: string;
  email?: string;
  points: number;
  addresses: Address[];
  currentState: CustomerState;
  tempData?: any;
  createdAt: Date;
  lastInteraction: Date;
}

export enum CustomerState {
  INITIAL = 'INITIAL',
  NEW_CUSTOMER = 'NEW_CUSTOMER',
  RETURNING_CUSTOMER = 'RETURNING_CUSTOMER',
  COLLECTING_NAME = 'COLLECTING_NAME',
  COLLECTING_EMAIL = 'COLLECTING_EMAIL',
  AWAITING_EMAIL_INPUT = 'AWAITING_EMAIL_INPUT',
  REGISTRATION_COMPLETE = 'REGISTRATION_COMPLETE',
  REQUEST_ADDRESS_METHOD = 'REQUEST_ADDRESS_METHOD',
  AWAITING_ADDRESS_INPUT = 'AWAITING_ADDRESS_INPUT',
  AWAITING_ADDRESS_DETAILS = 'AWAITING_ADDRESS_DETAILS',
  AWAITING_LOCATION_PIN = 'AWAITING_LOCATION_PIN',
  CONFIRM_ADDRESS = 'CONFIRM_ADDRESS',
  ADDRESS_VALIDATED = 'ADDRESS_VALIDATED',
  // Add more states as needed
  BROWSING_MENU = 'BROWSING_MENU',
  VIEWING_CATEGORY = 'VIEWING_CATEGORY',
  CART_REVIEW = 'CART_REVIEW',
  CHECKOUT = 'CHECKOUT',
  PAYMENT_PENDING = 'PAYMENT_PENDING',
  ORDER_CONFIRMED = 'ORDER_CONFIRMED'
}