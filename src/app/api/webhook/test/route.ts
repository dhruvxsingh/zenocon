import { NextResponse } from 'next/server';

// Types and Interfaces
interface Customer {
  name?: string;
  email?: string;
  points: number;
  registrationStep?: string; // 'start' | 'name' | 'email' | 'complete'
}

// Mock database with state management
const mockCustomersDB: Record<string, Customer> = {};

// WhatsApp API configuration
const WHATSAPP_API_URL = `https://graph.facebook.com/v19.0/${process.env.META_PHONE_NUMBER_ID}/messages`;
const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;

async function sendWhatsAppMessage(to: string, message: any) {
  try {
    const response = await fetch(WHATSAPP_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        ...message
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
    console.log("Incoming webhook payload:", JSON.stringify(body, null, 2));

    // Extract message info
    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!message) return NextResponse.json({ status: "ok" });

    const customerNumber = message.from;
    const customerName = body.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.profile?.name;
    const messageBody = message.text?.body?.toLowerCase().trim();

    if (!customerNumber) return NextResponse.json({ status: "ok" });

    // Get or create customer
    let customer = mockCustomersDB[customerNumber] || { 
      points: 0,
      registrationStep: undefined 
    };

    // Handle registration flow
    if (messageBody === 'register' || customer.registrationStep) {
      await handleRegistrationFlow(customerNumber, customer, messageBody);
    } else if (!mockCustomersDB[customerNumber]) {
      // Initial welcome for new customers
      await sendWhatsAppMessage(customerNumber, {
        type: 'text',
        text: { 
          body: `Welcome ${customerName}! Type "REGISTER" to start ordering. You'll get 100 bonus points!` 
        }
      });
    }

    // Save customer state
    mockCustomersDB[customerNumber] = customer;

    return NextResponse.json({ status: "ok" });
  } catch (error) {
    console.error("Error in webhook:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

async function handleRegistrationFlow(phone: string, customer: Customer, message: string) {
  // Determine current step
  if (!customer.registrationStep) {
    // Start registration
    customer.registrationStep = 'name';
    await sendWhatsAppMessage(phone, {
      type: 'text',
      text: { body: 'Great! What\'s your full name?' }
    });
  } 
  else if (customer.registrationStep === 'name') {
    // Collect name
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
              reply: { id: 'email_yes', title: 'Yes, provide email' }
            },
            {
              type: 'reply',
              reply: { id: 'email_no', title: 'Skip email' }
            }
          ]
        }
      }
    });
  }
  else if (customer.registrationStep === 'email') {
    // Handle email response
    if (message === 'yes, provide email' || message === 'email_yes') {
      await sendWhatsAppMessage(phone, {
        type: 'text',
        text: { body: 'Please enter your email address:' }
      });
      customer.registrationStep = 'email_pending';
    } else {
      // Skip email
      await completeRegistration(phone, customer);
    }
  }
  else if (customer.registrationStep === 'email_pending') {
    // Validate email (basic check)
    if (message.includes('@')) {
      customer.email = message;
      await completeRegistration(phone, customer);
    } else {
      await sendWhatsAppMessage(phone, {
        type: 'text',
        text: { body: 'Please enter a valid email address or type "skip" to continue without email' }
      });
    }
  }
}

async function completeRegistration(phone: string, customer: Customer) {
  customer.registrationStep = 'complete';
  customer.points += 100; // Add welcome bonus
  
  await sendWhatsAppMessage(phone, {
    type: 'text',
    text: { 
      body: `🎉 Registration complete, ${customer.name}! You've earned 100 bonus points.\n\n` +
            `Next, we'll need your delivery address. Please send your full address.`
    }
  });
}