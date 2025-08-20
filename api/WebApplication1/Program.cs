
using WebApplication1.Hubs;

namespace WebApplication1
{
    public class Program
    {
        public static void Main(string[] args)
        {
            var builder = WebApplication.CreateBuilder(args);

            // Add services to the container.
            builder.Services.AddControllers();

            // Add SignalR
            builder.Services.AddSignalR();

            // Add CORS for Angular app
            builder.Services.AddCors(options =>
            {
                options.AddPolicy("AllowAngularApp", policy =>
                {
                    policy.WithOrigins("http://localhost:4200", "https://localhost:4200")
                          .AllowAnyHeader()
                          .AllowAnyMethod()
                          .AllowCredentials();
                });
            });

            var app = builder.Build();

            // Configure the HTTP request pipeline.
            app.UseHttpsRedirection();

            // Use CORS
            app.UseCors("AllowAngularApp");

            app.UseAuthorization();

            app.MapControllers();

            // Map SignalR Hub
            app.MapHub<ChatHub>("/chathub");

            app.Run();
        }
    }
}
