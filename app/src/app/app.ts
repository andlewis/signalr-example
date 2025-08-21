import { Component, signal, computed, OnDestroy, inject, OnInit, effect } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SignalRService } from './services/signalr.service';
import { Router, ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit, OnDestroy {
  protected readonly title = signal('SignalR Chat App');
  protected readonly prompt = signal('');
  
  private subscriptions = new Subscription();

  // Inject services
  private signalRService = inject(SignalRService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  // Get connection status and messages from SignalR service
  protected readonly connectionStatus = this.signalRService.connectionStatus;
  protected readonly messages = this.signalRService.messages;
  protected readonly connectionId = this.signalRService.connectionId;
  protected readonly userSessionId = this.signalRService.userSessionId;

  // Computed property to format messages for display
  protected readonly formattedMessages = computed(() => {
    return this.messages().join('\n\n');
  });

  constructor() {
    // Effect to update URL when user session ID changes
    effect(() => {
      const sessionId = this.userSessionId();
      if (sessionId) {
        // Update URL with user session ID
        this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { sessionId: sessionId },
          queryParamsHandling: 'merge'
        });
      }
    });
  }

  ngOnInit(): void {
    // Subscribe to query parameters to handle session restoration
    const queryParamsSub = this.route.queryParams.subscribe(params => {
      console.log('Current URL query params:', params);
      const urlSessionId = params['sessionId'] || params['connectionId'];
      console.log('Found session ID in URL:', urlSessionId);
      if (urlSessionId) {
        console.log('Setting session ID from URL:', urlSessionId);
        // Pass the session ID to the service
        this.signalRService.setUserSessionIdFromUrl(urlSessionId);
      } else {
        console.log('No session ID found in URL - will generate new one');
      }
    });
    
    this.subscriptions.add(queryParamsSub);
  }

  protected async onSubmit(): Promise<void> {
    const currentPrompt = this.prompt();
    if (currentPrompt.trim()) {
      // Send message via SignalR
      await this.signalRService.sendMessage(currentPrompt);
      
      // Clear the prompt input
      this.prompt.set('');
    }
  }

  protected onPromptChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.prompt.set(target.value);
  }

  protected clearMessages(): void {
    this.signalRService.clearMessages();
  }

  protected async reconnect(): Promise<void> {
    // Completely restart the connection and clear messages
    await this.signalRService.restartConnection();
  }

  protected async refreshConnectionId(): Promise<void> {
    await this.signalRService.requestConnectionId();
  }

  protected async copyUrlToClipboard(): Promise<void> {
    try {
      const currentUrl = window.location.href;
      await navigator.clipboard.writeText(currentUrl);
      console.log('URL copied to clipboard:', currentUrl);
      // You could show a toast notification here
    } catch (error) {
      console.error('Failed to copy URL to clipboard:', error);
      // Fallback: select and copy manually
      const textArea = document.createElement('textarea');
      textArea.value = window.location.href;
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand('copy');
        console.log('URL copied to clipboard (fallback method)');
      } catch (fallbackError) {
        console.error('Fallback copy failed:', fallbackError);
      }
      document.body.removeChild(textArea);
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.signalRService.disconnect();
  }
}
