import 'cookie-session';
declare global {
  namespace CookieSessionInterfaces {
    interface CookieSessionObject { username?: string }
  }
}
