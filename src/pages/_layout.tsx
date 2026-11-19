import { LiveDataProvider } from "@/contexts/LiveDataContext";
import Footer from "../components/Footer";
import NavBar from "../components/NavBar";
import { Outlet, useLocation } from "react-router-dom";
import { usePublicInfo } from "@/contexts/PublicInfoContext";
import { useIsMobile } from "@/hooks/use-mobile";

// Keep the component identity stable when appearance or public settings change.
function InnerLayout() {
  const { publicInfo } = usePublicInfo();
  const location = useLocation();
  const isHome = location.pathname === "/";
  const isInstance = location.pathname.startsWith("/instance/");
  const isMobile = useIsMobile();
  const settings = publicInfo?.theme_settings;
  const desktop =
    typeof settings?.backgroundImageUrlDesktop === "string"
      ? settings.backgroundImageUrlDesktop
      : "";
  const mobile =
    typeof settings?.backgroundImageUrlMobile === "string"
      ? settings.backgroundImageUrlMobile
      : "";
  const background = isMobile ? mobile || desktop : desktop;
  const rawWidth = Number(settings?.mainContentWidth);
  const width =
    Number.isFinite(rawWidth) && rawWidth > 0 ? Math.min(100, rawWidth) : 100;
  return (
    <div
      className={
        background
          ? "km-layout layout flex flex-col w-full min-h-screen bg-cover bg-center bg-fixed bg-no-repeat"
          : "km-layout layout flex flex-col w-full min-h-screen bg-accent-1"
      }
      style={{
        backgroundImage: background ? "url(" + background + ")" : undefined,
      }}
    >
      <main
        className="km-main main-content m-1 h-full"
        style={{ width: width + "vw", marginLeft: "auto", marginRight: "auto" }}
      >
        {!isInstance && <NavBar />}
        <Outlet />
      </main>
      {!isHome && <Footer />}
    </div>
  );
}
export default function IndexLayout() {
  return (
    <LiveDataProvider>
      <InnerLayout />
    </LiveDataProvider>
  );
}
