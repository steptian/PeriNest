import { Navigate, Route, Routes, BrowserRouter } from "react-router-dom";
import BottomNav from "@/components/BottomNav";
import Home from "@/pages/Home";
import Login from "@/pages/Login";
import Orders from "@/pages/Orders";
import Chat from "@/pages/Chat";
import Profile from "@/pages/Profile";
import WecomSidebar from "@/pages/WecomSidebar";
import { useAuthStore } from "@/stores/auth";

function RequireAuth({ children }: { children: JSX.Element }) {
  const token = useAuthStore((s) => s.token);
  return token ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <div className="pb-16">
                <BottomNav />
              </div>
            </RequireAuth>
          }
        >
          <Route index element={<Home />} />
          <Route path="orders" element={<Orders />} />
          <Route path="chat" element={<Chat />} />
          <Route path="profile" element={<Profile />} />
          <Route path="wecom/sidebar" element={<WecomSidebar />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
