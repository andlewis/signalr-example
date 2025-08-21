import { Injectable, signal } from '@angular/core';
import * as signalR from '@microsoft/signalr';

@Injectable({
  providedIn: 'root'
})
export class SignalRService {
  private hubConnection: signalR.HubConnection | null = null;
  public readonly connectionStatus = signal<string>('Disconnected');
  public readonly messages = signal<string[]>([]);
  public readonly connectionId = signal<string>('');
  public readonly userSessionId = signal<string>('');
  private urlUserSessionId: string | null = null;

  constructor() {
    // Clear any existing messages on service initialization
    this.messages.set([]);
    this.startConnection();
  }

  public setUserSessionIdFromUrl(sessionId: string | null): void {
    console.log('setUserSessionIdFromUrl called with:', sessionId);
    this.urlUserSessionId = sessionId;
    console.log('urlUserSessionId set to:', this.urlUserSessionId);
  }

  private generateUserSessionId(): string {
    return 'session_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now().toString(36);
  }

  private async startConnection(): Promise<void> {
    // Clear messages when starting a new connection
    this.messages.set([]);
    
    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl('https://localhost:7258/chathub', {
        transport: signalR.HttpTransportType.WebSockets
      })
      .build();

    // Listen for messages from the server
    this.hubConnection.on('ReceiveMessage', (message: string) => {
      console.log('Received message:', message);
      console.log('Current connection ID:', this.connectionId());
      
      // Only add messages that are relevant to this client
      // You can add additional filtering here if needed
      const currentMessages = this.messages();
      this.messages.set([...currentMessages, message]);
    });

    // Listen for user session info from the server
    this.hubConnection.on('ReceiveUserSession', (sessionId: string) => {
      console.log('Received user session ID from server:', sessionId);
      this.userSessionId.set(sessionId);
    });

    // Listen for connection ID from the server
    this.hubConnection.on('ReceiveConnectionId', (connectionId: string) => {
      console.log('Received connection ID from server:', connectionId);
      this.connectionId.set(connectionId);
      // Don't register session here - wait for connection to be fully established
    });

    // Listen for user session confirmation
    this.hubConnection.on('ReceiveUserSession', (sessionId: string) => {
      console.log('User session registered:', sessionId);
      this.userSessionId.set(sessionId);
    });

    // Handle connection state changes
    this.hubConnection.onclose(() => {
      this.connectionStatus.set('Disconnected');
      this.connectionId.set('');
    });

    this.hubConnection.onreconnecting(() => {
      this.connectionStatus.set('Reconnecting...');
    });

    this.hubConnection.onreconnected(() => {
      this.connectionStatus.set('Connected');
      // Request connection ID from server after reconnection
      this.hubConnection?.invoke('GetConnectionId').catch(err => 
        console.error('Error getting connection ID:', err)
      );
    });

    try {
      await this.hubConnection.start();
      this.connectionStatus.set('Connected');
      
      // Wait a bit and try to get the connection ID
      setTimeout(() => {
        const connId = this.hubConnection?.connectionId;
        console.log('Connection ID from hubConnection:', connId);
        if (connId) {
          this.connectionId.set(connId);
        } else {
          this.connectionId.set('ID not available');
        }
        
        // Register user session after connection is fully established
        console.log('About to register user session...');
        this.registerUserSession();
      }, 100);
      
      console.log('SignalR connection started successfully');
    } catch (error) {
      this.connectionStatus.set('Failed to connect');
      this.connectionId.set('');
      console.error('Error starting SignalR connection:', error);
      
      // Retry connection after 5 seconds
      setTimeout(() => this.startConnection(), 5000);
    }
  }

  public async sendMessage(message: string): Promise<void> {
    const sessionId = this.userSessionId();
    console.log('Sending message. Session ID:', sessionId, 'Message:', message);
    
    if (this.hubConnection && this.hubConnection.state === signalR.HubConnectionState.Connected) {
      try {
        if (sessionId) {
          // Use session-based messaging
          await this.hubConnection.invoke('SendUserMessage', sessionId, message);
          console.log('Sent message via SendUserMessage');
        } else {
          // Fallback to direct messaging
          await this.hubConnection.invoke('SendMessage', message);
          console.log('Sent message via SendMessage (fallback)');
        }
      } catch (error) {
        console.error('Error sending message:', error);
      }
    } else {
      console.warn('SignalR connection is not established');
    }
  }

  private async registerUserSession(): Promise<void> {
    if (this.hubConnection && this.hubConnection.state === signalR.HubConnectionState.Connected) {
      try {
        // Use URL session ID if available, otherwise generate new one
        const sessionId = this.urlUserSessionId || this.generateUserSessionId();
        console.log('Registering user session:', sessionId);
        console.log('URL session ID:', this.urlUserSessionId);
        console.log('About to invoke RegisterUserSession on server...');
        await this.hubConnection.invoke('RegisterUserSession', sessionId);
        console.log('RegisterUserSession invoked successfully');
      } catch (error) {
        console.error('Error registering user session:', error);
      }
    } else {
      console.log('Cannot register session - connection not ready. State:', this.hubConnection?.state);
    }
  }

  public async requestConnectionId(): Promise<void> {
    if (this.hubConnection && this.hubConnection.state === signalR.HubConnectionState.Connected) {
      try {
        await this.hubConnection.invoke('GetConnectionId');
      } catch (error) {
        console.error('Error requesting connection ID:', error);
      }
    }
  }

  public async disconnect(): Promise<void> {
    if (this.hubConnection) {
      // Remove all event handlers before disconnecting
      this.hubConnection.off('ReceiveMessage');
      this.hubConnection.off('ReceiveConnectionId');
      
      await this.hubConnection.stop();
      this.connectionStatus.set('Disconnected');
      this.connectionId.set('');
    }
  }

  public clearMessages(): void {
    this.messages.set([]);
  }

  public async restartConnection(): Promise<void> {
    await this.disconnect();
    this.clearMessages();
    await this.startConnection();
  }
}
