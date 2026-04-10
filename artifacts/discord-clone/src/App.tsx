import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import Register from "@/pages/register";
import Home from "@/pages/home";
import { SocketProvider } from "@/hooks/use-socket";
import { VoiceSFUProvider, useVoiceSFU } from "@/hooks/use-voice-sfu";
import { IncomingCallModal } from "@/components/IncomingCallModal";
import { FloatingCallWidget } from "@/components/ActiveCallOverlay";
import { SettingsModal } from "@/components/modals/SettingsModal";
import { useSettings } from "@/hooks/use-settings";

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

// Separate component so it can use the VoiceSFU context
function AppWithCallModal() {
  const { incomingCall } = useVoiceSFU();

  return (
    <>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <Router />
      </WouterRouter>
      <Toaster />
      {incomingCall && <IncomingCallModal />}
      <FloatingCallWidget />
      <GlobalSettings />
    </>
  );
}

function GlobalSettings() {
  const { isOpen, closeSettings } = useSettings();
  return <SettingsModal isOpen={isOpen} onClose={closeSettings} />;
}

import { UnreadProvider } from "@/hooks/use-unread";

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SocketProvider>
        <UnreadProvider>
          <VoiceSFUProvider>
            <TooltipProvider>
              <AppWithCallModal />
            </TooltipProvider>
          </VoiceSFUProvider>
        </UnreadProvider>
      </SocketProvider>
    </QueryClientProvider>
  );
}

export default App;
