using Microsoft.AspNetCore.SignalR;

namespace WebApplication1.Hubs
{
    public class ChatHub : Hub
    {
        // Static dictionary to track user sessions (in production, use a database)
        private static readonly Dictionary<string, UserSession> UserSessions = new();

        public async Task SendMessage(string message)
        {
            // Echo the message back only to the client that sent it
            var response = $"Server received: {message} at {DateTime.Now:HH:mm:ss}";
            Console.WriteLine($"SendMessage called. Connection: {Context.ConnectionId}, Message: {message}");
            await SendMessageToConnection(Context.ConnectionId, response);
        }

        public async Task GetConnectionId()
        {
            // Send the connection ID back to the caller
            await Clients.Caller.SendAsync("ReceiveConnectionId", Context.ConnectionId);
        }

        public async Task RegisterUserSession(string userSessionId)
        {
            // Map user session ID to current SignalR connection
            if (!UserSessions.ContainsKey(userSessionId))
            {
                UserSessions[userSessionId] = new UserSession 
                { 
                    UserSessionId = userSessionId,
                    Messages = new List<string>()
                };
            }

            UserSessions[userSessionId].CurrentConnectionId = Context.ConnectionId;
            UserSessions[userSessionId].LastConnected = DateTime.Now;

            // Send session info back to client
            await Clients.Caller.SendAsync("ReceiveUserSession", userSessionId);

            // Send previous messages from this session
            var session = UserSessions[userSessionId];
            if (session.Messages.Any())
            {
                await SendMessageToConnection(Context.ConnectionId, 
                    $"--- Restored {session.Messages.Count} previous messages ---");
                
                foreach (var msg in session.Messages.TakeLast(10)) // Send last 10 messages
                {
                    await SendMessageToConnection(Context.ConnectionId, msg);
                }
            }
            else
            {
                await SendMessageToConnection(Context.ConnectionId, 
                    $"--- Started new session: {userSessionId} ---");
            }
        }

        public async Task SendUserMessage(string userSessionId, string message)
        {
            Console.WriteLine($"SendUserMessage called. Session: {userSessionId}, Connection: {Context.ConnectionId}, Message: {message}");
            
            var timestampedMessage = $"[{DateTime.Now:HH:mm:ss}] You: {message}";
            var response = $"[{DateTime.Now:HH:mm:ss}] Server: Received - {message}";

            // Store messages in user session
            if (UserSessions.ContainsKey(userSessionId))
            {
                UserSessions[userSessionId].Messages.Add(timestampedMessage);
                UserSessions[userSessionId].Messages.Add(response);

                // Keep only last 50 messages per session
                if (UserSessions[userSessionId].Messages.Count > 50)
                {
                    UserSessions[userSessionId].Messages.RemoveRange(0, 
                        UserSessions[userSessionId].Messages.Count - 50);
                }
                
                Console.WriteLine($"Messages stored for session {userSessionId}. Total: {UserSessions[userSessionId].Messages.Count}");
            }
            else
            {
                Console.WriteLine($"Session {userSessionId} not found in UserSessions!");
            }

            // Send response back to the client
            await SendMessageToConnection(Context.ConnectionId, response);
        }

        private async Task SendMessageToConnection(string connectionId, string message)
        {
            Console.WriteLine($"SendMessageToConnection called. Connection: {connectionId}, Message: {message}");
            await Clients.Client(connectionId).SendAsync("ReceiveMessage", message);
        }

        public async Task JoinGroup(string groupName)
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, groupName);
            await SendMessageToConnection(Context.ConnectionId, $"You joined group: {groupName}");
        }

        public async Task LeaveGroup(string groupName)
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, groupName);
            await SendMessageToConnection(Context.ConnectionId, $"You left group: {groupName}");
        }

        public override async Task OnConnectedAsync()
        {
            // Send the connection ID to the newly connected client
            await Clients.Caller.SendAsync("ReceiveConnectionId", Context.ConnectionId);
            await base.OnConnectedAsync();
        }

        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            // Update user sessions to mark connection as disconnected
            var disconnectedSession = UserSessions.Values
                .FirstOrDefault(s => s.CurrentConnectionId == Context.ConnectionId);
            
            if (disconnectedSession != null)
            {
                disconnectedSession.CurrentConnectionId = null;
                disconnectedSession.LastDisconnected = DateTime.Now;
            }

            await base.OnDisconnectedAsync(exception);
        }
    }

    public class UserSession
    {
        public string UserSessionId { get; set; } = string.Empty;
        public string? CurrentConnectionId { get; set; }
        public DateTime LastConnected { get; set; }
        public DateTime? LastDisconnected { get; set; }
        public List<string> Messages { get; set; } = new();
    }
}
