import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import Register from "@/pages/register";
import Home from "@/pages/home";
import { SocketProvider } from "@/hooks/use-socket";
import { WebRTCProvider, useWebRTC } from "@/hooks/use-webrtc";
import { IncomingCallModal } from "@/components/IncomingCallModal";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/dm/:id" component={Home} />
      <Route path="/group/:id" component={Home} />
      <Route path="/" component={Home} />
      <Route component={NotFound} />
    </Switch>
  );
}

import { FloatingCallWidget } from "@/components/ActiveCallOverlay";

// Separate component so it can use the WebRTC context
function AppWithCallModal() {
  const { incomingCall, acceptCall, declineCall } = useWebRTC();

  return (
    <>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <Router />
      </WouterRouter>
      <Toaster />
      {incomingCall && <IncomingCallModal />}
      <FloatingCallWidget />
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SocketProvider>
        <WebRTCProvider>
          <TooltipProvider>
            <AppWithCallModal />
          </TooltipProvider>
        </WebRTCProvider>
      </SocketProvider>
    </QueryClientProvider>
  );
}

export default App;
