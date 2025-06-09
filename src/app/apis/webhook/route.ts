
import { NextRequest, NextResponse } from 'next/server';

// Types
interface ProductItem {
  product_retailer_id: string;
  quantity: number;
  item_price: number;
  currency: string;
}

interface OrderData {
  catalog_id: string;
  text: string;
  product_items: ProductItem[];
}

interface WhatsAppMessage {
  messaging_product: string;
  to: string;
  type: string;
  text?: {
    body: string;
  };
  interactive?: {
    type: string;
    body?: {
      text: string;
    };
    action?: {
      name?: string; // Optional for button messages
      buttons?: Array<{
        type: string;
        reply: {
          id: string;
          title: string;
        };
      }>;
    };
    footer?: {
      text: string;
    };
  };
}

// Environment variables
const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || '';
const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'your_verify_token_here';
const PHONE_NUMBER_ID = process.env.META_PHONE_NUMBER_ID || '';


// Simple in-memory state management (use database in production)
const userStates = new Map<string, string>();

// User flow states
const STATES = {
  INITIAL: 'initial',
  WAITING_ADDRESS: 'waiting_address',
  ADDRESS_PROVIDED: 'address_provided',
  CATALOG_SHOWN: 'catalog_shown',
  ORDER_PLACED: 'order_placed'
} as const;

// Webhook verification
export async function GET(request: NextRequest) {

  const { searchParams } = new URL(request.url);
  
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  } else {
    return new NextResponse('Forbidden', { status: 403 });
  }
}

// Handle incoming messages
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('Received webhook:', JSON.stringify(body, null, 2));

    // Extract WhatsApp message
    if (body.entry && body.entry[0]?.changes && body.entry[0].changes[0]?.value?.messages) {
      const message = body.entry[0].changes[0].value.messages[0];
      const fromNumber = message.from;
      
      // Handle different message types
      if (message.type === 'order') {
        // Handle catalog order
        await handleCatalogOrder(fromNumber, message.order);
      } else {
        // Handle text messages
        const userMessage = message.text?.body || '';
        const currentState = userStates.get(fromNumber) || STATES.INITIAL;
        await handleUserMessage(fromNumber, userMessage, currentState);
      }
      
      return new NextResponse(JSON.stringify({ status: 'success' }), { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new NextResponse(JSON.stringify({ status: 'success' }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error processing webhook:', error);
    return new NextResponse(JSON.stringify({ 
      status: 'error', 
      message: 'Failed to process webhook' 
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function handleUserMessage(fromNumber: string, message: string, currentState: string) {
  const lowerMessage = message.toLowerCase();

  switch (currentState) {
    case STATES.INITIAL:
      if (lowerMessage.includes('hi') || lowerMessage.includes('hello')) {
        await requestAddress(fromNumber);
        userStates.set(fromNumber, STATES.WAITING_ADDRESS);
      } else {
        await sendWelcomeMessage(fromNumber);
      }
      break;

    case STATES.WAITING_ADDRESS:
      // Store address and show catalog
      await showCatalog(fromNumber);
      userStates.set(fromNumber, STATES.CATALOG_SHOWN);
      break;

    case STATES.CATALOG_SHOWN:
      // This will be handled by handleCatalogOrder when user places order from catalog
      await sendText(fromNumber, "Please select items from the catalog above to place your order.");
      break;

    case STATES.ORDER_PLACED:
      // Handle payment method selection or confirmation
      if (lowerMessage.includes('pay_upi') || lowerMessage.includes('pay_card') || lowerMessage.includes('pay_cod')) {
        await sendOrderConfirmation(fromNumber);
        userStates.set(fromNumber, STATES.INITIAL); // Reset for new order
      } else {
        await sendText(fromNumber, "Please select a payment method from the options above to complete your order.");
      }
      break;

    default:
      await sendWelcomeMessage(fromNumber);
      userStates.set(fromNumber, STATES.INITIAL);
  }
}

async function sendWelcomeMessage(to: string) {
  const messageData = {
    messaging_product: 'whatsapp',
    to: to,
    type: 'text',
    text: {
      body: 'Hello! Welcome to our store. Please say "Hi" to start ordering.'
    }
  };

  await sendWhatsAppMessage(messageData);
}

async function requestAddress(to: string) {
  const messageData = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to,
    type: 'interactive',
    interactive: {
      type: 'location_request_message',
      body: {
        text: 'Great! To proceed with your order, please share your delivery location.'
      },
      action: {
        name: 'send_location'
      }
    }
  };

  await sendWhatsAppMessage(messageData);
}

async function showCatalog(to: string) {
  const messageData = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to,
    type: 'interactive',
    interactive: {
      type: 'catalog_message',
      body: {
        text: 'Perfect! Here\'s our product catalog. Browse and select items you\'d like to order.'
      },
      action: {
        name: 'catalog_message'
      },
      footer: {
        text: 'Select items to add to your cart'
      }
    }
  };

  await sendWhatsAppMessage(messageData);
}

async function handleCatalogOrder(fromNumber: string, orderData: OrderData) {
  console.log('Processing catalog order:', orderData);
  
  // Extract order details
  const orderText = orderData.text;
  const productItems = orderData.product_items;
  
  // Calculate order total
  let totalAmount = 0;
  let itemsText = '';
  
  productItems.forEach((item: ProductItem, index: number) => {
    const itemTotal = item.quantity * item.item_price;
    totalAmount += itemTotal;
    itemsText += `${index + 1}. Product ID: ${item.product_retailer_id}\n   Quantity: ${item.quantity}\n   Price: ${item.currency} ${item.item_price}\n   Subtotal: ${item.currency} ${itemTotal}\n\n`;
  });

  // Send order confirmation with details
  await sendOrderSummary(fromNumber, orderText, itemsText, totalAmount, productItems[0]?.currency || 'INR');
  
  // Update user state
  userStates.set(fromNumber, STATES.ORDER_PLACED);
  
  // Send payment instructions
  setTimeout(() => {
    sendPaymentInstructions(fromNumber, totalAmount, productItems[0]?.currency || 'INR');
  }, 2000);
}

async function sendOrderSummary(to: string, orderText: string, itemsText: string, total: number, currency: string) {
  const messageText = `🛒 *Order Confirmed!*

${orderText ? `Message: ${orderText}\n\n` : ''}*Items Ordered:*
${itemsText}
*Total Amount: ${currency} ${total}*

We're processing your order now. Payment details will follow shortly.`;

  await sendText(to, messageText);
}

async function sendPaymentInstructions(to: string, amount: number, currency: string) {
  const messageData = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: {
        text: `💳 *Payment Required*\n\nAmount: ${currency} ${amount}\n\nPlease choose your payment method:`
      },
      action: {
        buttons: [
          {
            type: 'reply',
            reply: {
              id: 'pay_upi',
              title: 'Pay with UPI'
            }
          },
          {
            type: 'reply',
            reply: {
              id: 'pay_card',
              title: 'Pay with Card'
            }
          },
          {
            type: 'reply',
            reply: {
              id: 'pay_cod',
              title: 'Cash on Delivery'
            }
          }
        ]
      }
    }
  };

  await sendWhatsAppMessage(messageData);
}

async function sendText(to: string, text: string) {
  const messageData = {
    messaging_product: 'whatsapp',
    to: to,
    type: 'text',
    text: {
      body: text
    }
  };

  await sendWhatsAppMessage(messageData);
}

async function sendOrderConfirmation(to: string) {
  const orderReference = `ORD${Date.now()}`;
  
  const messageText = `✅ *Payment Successful!*

🎉 Thank you for your order!

*Order Reference:* ${orderReference}
*Status:* Confirmed & Processing

Your order has been received and we're preparing it for delivery. You'll receive updates as we process your order.

*Estimated Delivery:* 2-3 business days

Type "track" anytime to check your order status.

Thank you for shopping with us! 🛍`;

  await sendText(to, messageText);
}

async function sendWhatsAppMessage(messageData: WhatsAppMessage) {
  try {
    const response = await fetch(`https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messageData)
    });

    const result = await response.json();
    console.log('WhatsApp API response:', result);
    
    if (!response.ok) {
      throw new Error(`WhatsApp API error: ${JSON.stringify(result)}`);
    }
    
    return result;
  } catch (error) {
    console.error('Error sending WhatsApp message:', error);
    throw error;
  }
}