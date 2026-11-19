import { LiveDataProvider } from "@/contexts/LiveDataContext";
import Footer from "../components/Footer";
import NavBar from "../components/NavBar";
import { Outlet, useLocation } from "react-router-dom";
import { usePublicInfo } from "@/contexts/PublicInfoContext";
import { useIsMobile } from "@/hooks/use-mobile";

const IndexLayout = () => {
  // 使用我们的LiveDataContext
  const InnerLayout = () => {
    const { publicInfo } = usePublicInfo();
    const location = useLocation();
    const isHome = location.pathname === "/";
    const isInstance = location.pathname.startsWith("/instance/");
    const isMobile = useIsMobile();
    const bgUrlDesktop = publicInfo?.theme_settings?.backgroundImageUrlDesktop;
    const bgUrlMobile = publicInfo?.theme_settings?.backgroundImageUrlMobile;
    const bgUrl = isMobile ? bgUrlMobile || bgUrlDesktop : bgUrlDesktop;
    const mainContentWidth =
      publicInfo?.theme_settings?.mainContentWidth ?? 100;
    return (
      <>
        <div
          className={
            bgUrl
              ? "km-layout layout flex flex-col w-full min-h-screen bg-cover bg-center bg-fixed bg-no-repeat"
              : "km-layout layout flex flex-col w-full min-h-screen bg-accent-1"
          }
          style={{
            backgroundImage: bgUrl ? `url(${bgUrl})` : undefined,
          }}
        >
          <main
            className="km-main main-content m-1 h-full"
            style={{
              width: `${mainContentWidth}vw`,
              marginLeft: "auto",
              marginRight: "auto",
            }}
          >
            {!isInstance && <NavBar />}
            <Outlet />
          </main>
          {!isHome && <Footer />}
        </div>
      </>
    );
  };

  return (
    <LiveDataProvider>
      <InnerLayout />
    </LiveDataProvider>
  );
};

export default IndexLayout;
