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

// Mock database with state management
const mockCustomersDB: Record<string, Customer> = {};

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

    let customer = mockCustomersDB[customerNumber] || {
      points: 0,
      registrationStep: undefined,
      addressStep: undefined,
    };

    // Handle different message types
    if (messageType === 'text') {
      const messageBody = message.text?.body?.toLowerCase().trim();
      
      // Check if we're in registration flow
      if (messageBody === 'register' || (customer.registrationStep && customer.registrationStep !== 'complete')) {
        await handleRegistrationFlow(customerNumber, customer, messageBody);
      }
      // Check if we're in address flow
      else if (customer.addressStep === 'awaiting_text') {
        customer.address = { text: message.text.body };
        await confirmAddress(customerNumber, customer);
      }
      else if (customer.addressStep === 'awaiting_details') {
        customer.address = { ...customer.address, details: message.text.body };
        await confirmAddress(customerNumber, customer);
      }
      // Initial message
      else if (!mockCustomersDB[customerNumber]) {
        await sendWhatsAppMessage(customerNumber, {
          type: 'text',
          text: {
            body: `Welcome ${customerName}! Type "REGISTER" to start ordering. You'll get 100 bonus points!`,
          },
        });
      }
      // Returning customer
      else if (customer.registrationStep === 'complete' && !customer.addressStep) {
        await startAddressFlow(customerNumber, customer);
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

    mockCustomersDB[customerNumber] = customer;
    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error('Error in webhook:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

async function handleButtonResponse(phone: string, customer: Customer, buttonId: string) {
  // Registration buttons
  if (buttonId === 'email_yes') {
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
  if (!customer.registrationStep || message === 'register') {
    customer.registrationStep = 'name';
    await sendWhatsAppMessage(phone, {
      type: 'text',
      text: { body: "Great! What's your full name?" },
    });
  } else if (customer.registrationStep === 'name') {
    customer.name = message;
    customer.registrationStep = 'email';
    await sendWhatsAppMessage(phone, {
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: 'Would you like to provide your email for receipts and updates?' },
        action: {
          buttons: [
            {
              type: 'reply',
              reply: { id: 'email_yes', title: 'Yes, provide email' },
            },
            {
              type: 'reply',
              reply: { id: 'email_no', title: 'Skip email' },
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
      body: `🎉 Registration complete, ${customer.name}! You've earned 100 bonus points.\n\nNext, we'll need your delivery address.`,
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

// Add GET handler for webhook verification
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