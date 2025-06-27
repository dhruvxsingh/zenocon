import { NextResponse } from 'next/server';

// Types and Interfaces
interface Customer {
  name?: string;
  email?: string;
  points: number;
  registrationStep?: 'start' | 'name' | 'email' | 'email_pending' | 'complete';
  addressStep?: 'awaiting_method' | 'awaiting_location' | 'awaiting_text' | 'awaiting_details' | 'confirming' | 'complete';
  address?: {
    text?: string;
    location?: { latitude: number; longitude: number };
    details?: string;
    confirmed?: string;
  };
}

// In-memory database - persists between requests during server runtime
const customersDB = new Map<string, Customer>();

// WhatsApp API configuration
const WHATSAPP_API_URL = `https://graph.facebook.com/v17.0/${process.env.META_PHONE_NUMBER_ID}/messages`;
const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;

async function sendWhatsAppMessage(to: string, message: any) {
  try {
    const response = await fetch(WHATSAPP_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        ...message,
      }),
    });

    const data = await response.json();
    console.log('WhatsApp API response:', data);
    return data;
  } catch (error) {
    console.error('Error sending WhatsApp message:', error);
    throw error;
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log('Incoming webhook payload:', JSON.stringify(body, null, 2));

    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!message) return NextResponse.json({ status: 'ok' });

    const customerNumber = message.from;
    const customerName = body.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.profile?.name;
    const messageType = message.type;

    if (!customerNumber) return NextResponse.json({ status: 'ok' });

    // Get or create customer from in-memory database
    let customer = customersDB.get(customerNumber);
    
    // Check if returning customer
    if (!customer) {
      // New customer
      customer = {
        points: 0,
        registrationStep: undefined,
        addressStep: undefined,
      };
      customersDB.set(customerNumber, customer);
      
      // Send welcome message with register button
      await sendWhatsAppMessage(customerNumber, {
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { 
            text: `Welcome ${customerName}! 🎉\n\nI'm your food ordering assistant. Let's get you started with a quick registration.\n\nYou'll earn 100 bonus points! 🎁` 
          },
          action: {
            buttons: [
              {
                type: 'reply',
                reply: { id: 'start_registration', title: '✅ Start Registration' },
              },
            ],
          },
        },
      });
      return NextResponse.json({ status: 'ok' });
    }
    
    // Returning customer check
    if (customer.registrationStep === 'complete' && 
        (customer.addressStep === 'complete' || !customer.addressStep) && 
        messageType === 'text') {
      
      const messageBody = message.text?.body?.toLowerCase().trim();
      
      // Check if it's a menu request or just a greeting
      if (messageBody === 'menu') {
        // Show menu (implement later)
        await sendWhatsAppMessage(customerNumber, {
          type: 'text',
          text: {
            body: `🍕 Menu coming soon!\n\nFor now, here are our categories:\n1. Pizza\n2. Burgers\n3. Beverages`,
          },
        });
      } else {
        // Show welcome back message
        await sendWhatsAppMessage(customerNumber, {
          type: 'text',
          text: {
            body: `Welcome back, ${customer.name}! 🎉\n\nYou have ${customer.points} loyalty points.\n\nType "MENU" to start ordering!`,
          },
        });
      }
      
      return NextResponse.json({ status: 'ok' });
    }

    // Handle different message types
    if (messageType === 'text') {
      const messageBody = message.text?.body?.toLowerCase().trim();
      
      // Registration flow
      if (customer.registrationStep && customer.registrationStep !== 'complete') {
        await handleRegistrationFlow(customerNumber, customer, messageBody);
      }
      // Address flow - text input
      else if (customer.addressStep === 'awaiting_text') {
        customer.address = { text: message.text.body };
        await confirmAddress(customerNumber, customer);
      }
      else if (customer.addressStep === 'awaiting_details') {
        customer.address = { ...customer.address, details: message.text.body };
        await confirmAddress(customerNumber, customer);
      }
    }
    else if (messageType === 'interactive') {
      const buttonId = message.interactive?.button_reply?.id;
      await handleButtonResponse(customerNumber, customer, buttonId);
    }
    else if (messageType === 'location') {
      if (customer.addressStep === 'awaiting_location') {
        customer.address = {
          location: {
            latitude: message.location.latitude,
            longitude: message.location.longitude,
          },
        };
        customer.addressStep = 'awaiting_details';
        await sendWhatsAppMessage(customerNumber, {
          type: 'text',
          text: {
            body: '📍 Got your location!\n\nPlease provide additional details:\n• Building/House name\n• Floor number\n• Landmark\n• Delivery instructions',
          },
        });
      }
    }

    // Save updated customer data
    customersDB.set(customerNumber, customer);
    
    // Log current database state (for debugging)
    console.log(`Total customers in memory: ${customersDB.size}`);
    console.log(`Customer ${customerNumber} data:`, customer);
    
    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error('Error in webhook:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

async function handleButtonResponse(phone: string, customer: Customer, buttonId: string) {
  // Start registration button
  if (buttonId === 'start_registration') {
    customer.registrationStep = 'name';
    await sendWhatsAppMessage(phone, {
      type: 'text',
      text: { body: "Great! Let's start with your name.\n\nWhat's your full name?" },
    });
  }
  // Registration buttons
  else if (buttonId === 'email_yes') {
    customer.registrationStep = 'email_pending';
    await sendWhatsAppMessage(phone, {
      type: 'text',
      text: { body: 'Please enter your email address:' },
    });
  }
  else if (buttonId === 'email_no') {
    await completeRegistration(phone, customer);
  }
  // Address buttons
  else if (buttonId === 'share_location') {
    customer.addressStep = 'awaiting_location';
    await sendWhatsAppMessage(phone, {
      type: 'text',
      text: { body: '📍 Please share your current location using the attachment button (📎) in WhatsApp' },
    });
  }
  else if (buttonId === 'type_address') {
    customer.addressStep = 'awaiting_text';
    await sendWhatsAppMessage(phone, {
      type: 'text',
      text: {
        body: 'Please type your complete address:\n\nInclude:\n• House/Building number\n• Street name\n• Area\n• City and Pincode',
      },
    });
  }
  else if (buttonId === 'confirm_address') {
    customer.addressStep = 'complete';
    let finalAddress = '';
    if (customer.address?.details) {
      finalAddress = customer.address.details;
      if (customer.address.location) {
        finalAddress += '\n📍 Location attached';
      }
    } else if (customer.address?.text) {
      finalAddress = customer.address.text;
    }
    customer.address = { ...customer.address, confirmed: finalAddress };
    
    await sendWhatsAppMessage(phone, {
      type: 'text',
      text: {
        body: '✅ Address confirmed!\n\n🍕 Great! Now let\'s take your order.\n\nType "MENU" to see our offerings!',
      },
    });
  }
  else if (buttonId === 'change_address') {
    await startAddressFlow(phone, customer);
  }
}

async function handleRegistrationFlow(phone: string, customer: Customer, message: string) {
  if (customer.registrationStep === 'name') {
    customer.name = message;
    customer.registrationStep = 'email';
    await sendWhatsAppMessage(phone, {
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: `Nice to meet you, ${customer.name}! 👋\n\nWould you like to provide your email for order receipts and exclusive offers?` },
        action: {
          buttons: [
            {
              type: 'reply',
              reply: { id: 'email_yes', title: 'Yes, add email' },
            },
            {
              type: 'reply',
              reply: { id: 'email_no', title: 'Skip for now' },
            },
          ],
        },
      },
    });
  } else if (customer.registrationStep === 'email_pending') {
    if (message.includes('@')) {
      customer.email = message;
      await completeRegistration(phone, customer);
    } else if (message === 'skip') {
      await completeRegistration(phone, customer);
    } else {
      await sendWhatsAppMessage(phone, {
        type: 'text',
        text: {
          body: 'Please enter a valid email address or type "skip" to continue without email.',
        },
      });
    }
  }
}

async function completeRegistration(phone: string, customer: Customer) {
  customer.registrationStep = 'complete';
  customer.points += 100;

  await sendWhatsAppMessage(phone, {
    type: 'text',
    text: {
      body: `🎉 Registration complete, ${customer.name}!\n\n✅ You've earned 100 bonus points\n💰 Current balance: ${customer.points} points\n\nNext, we'll need your delivery address.`,
    },
  });

  // Start address flow after 2 seconds
  setTimeout(() => startAddressFlow(phone, customer), 2000);
}

async function startAddressFlow(phone: string, customer: Customer) {
  customer.addressStep = 'awaiting_method';
  customer.address = {}; // Reset address
  
  await sendWhatsAppMessage(phone, {
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: 'How would you like to provide your delivery address?' },
      action: {
        buttons: [
          {
            type: 'reply',
            reply: { id: 'share_location', title: '📍 Share Location' },
          },
          {
            type: 'reply',
            reply: { id: 'type_address', title: '📝 Type Address' },
          },
        ],
      },
    },
  });
}

async function confirmAddress(phone: string, customer: Customer) {
  customer.addressStep = 'confirming';
  
  let addressDisplay = '';
  if (customer.address?.details) {
    addressDisplay = customer.address.details;
    if (customer.address.location) {
      addressDisplay += '\n📍 Location pin attached';
    }
  } else if (customer.address?.text) {
    addressDisplay = customer.address.text;
  }

  await sendWhatsAppMessage(phone, {
    type: 'interactive',
    interactive: {
      type: 'button',
      body: {
        text: `Please confirm your delivery address:\n\n${addressDisplay}\n\n✅ Delivery available\n🚚 Delivery charge: ₹40\n⏱️ Estimated: 30-40 mins`,
      },
      action: {
        buttons: [
          {
            type: 'reply',
            reply: { id: 'confirm_address', title: '✅ Confirm' },
          },
          {
            type: 'reply',
            reply: { id: 'change_address', title: '✏️ Change' },
          },
        ],
      },
    },
  });
}

// GET handler for webhook verification
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === process.env.WEBHOOK_VERIFY_TOKEN) {
    console.log('Webhook verified successfully!');
    return new Response(challenge, { status: 200 });
  } else {
    return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
  }
}