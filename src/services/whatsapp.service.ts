export class WhatsAppService {
  private readonly apiUrl: string;
  private readonly accessToken: string;

  constructor() {
    this.apiUrl = `https://graph.facebook.com/v20.0/${process.env.META_PHONE_NUMBER_ID}/messages`;
    this.accessToken = process.env.META_ACCESS_TOKEN!;
  }

  async sendMessage(to: string, message: any) {
    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          ...message
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('WhatsApp API error:', error);
        throw new Error(`WhatsApp API error: ${JSON.stringify(error)}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error sending WhatsApp message:', error);
      throw error;
    }
  }

  async sendTextMessage(to: string, text: string) {
    return this.sendMessage(to, {
      type: 'text',
      text: { body: text }
    });
  }

  async sendInteractiveButtons(to: string, body: string, buttons: Array<{id: string, title: string}>, header?: string, footer?: string) {
    const message: any = {
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: body },
        action: {
          buttons: buttons.map(btn => ({
            type: 'reply',
            reply: { id: btn.id, title: btn.title }
          }))
        }
      }
    };

    if (header) {
      message.interactive.header = { type: 'text', text: header };
    }

    if (footer) {
      message.interactive.footer = { text: footer };
    }

    return this.sendMessage(to, message);
  }

  async sendInteractiveList(
    to: string, 
    body: string, 
    buttonText: string,
    sections: Array<{
      title: string,
      rows: Array<{
        id: string,
        title: string,
        description?: string
      }>
    }>,
    header?: string,
    footer?: string
  ) {
    const message: any = {
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: body },
        action: {
          button: buttonText,
          sections
        }
      }
    };

    if (header) {
      message.interactive.header = { type: 'text', text: header };
    }

    if (footer) {
      message.interactive.footer = { text: footer };
    }

    return this.sendMessage(to, message);
  }

  async sendLocationRequest(to: string, body: string) {
    return this.sendMessage(to, {
      type: 'interactive',
      interactive: {
        type: 'location_request_message',
        body: { text: body },
        action: { name: 'send_location' }
      }
    });
  }

  async sendImage(to: string, imageUrl: string, caption?: string) {
    const message: any = {
      type: 'image',
      image: { link: imageUrl }
    };

    if (caption) {
      message.image.caption = caption;
    }

    return this.sendMessage(to, message);
  }

  async markAsRead(messageId: string) {
    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          status: 'read',
          message_id: messageId
        }),
      });

      return await response.json();
    } catch (error) {
      console.error('Error marking message as read:', error);
    }
  }
}