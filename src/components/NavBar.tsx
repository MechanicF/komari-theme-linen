import ThemeSwitch from "./ThemeSwitch";
import ColorSwitch from "./ColorSwitch";
import LanguageSwitch from "./Language";
import { AccountProvider, useAccount } from "@/contexts/AccountContext";
import { IconButton } from "@radix-ui/themes";
import {
  Activity,
  ChevronRight,
  Languages,
  LogIn,
  Palette,
  Sun,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { usePublicInfo } from "@/contexts/PublicInfoContext";
import { useTranslation } from "react-i18next";
import { loginPath } from "@/utils/loginRedirect";

const NavBar = () => {
  const { publicInfo } = usePublicInfo();
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const { account } = useAccount();
  const english = (i18n.resolvedLanguage || i18n.language || "zh").startsWith(
    "en",
  );
  const siteName = publicInfo?.sitename || "Komari";
  const destination = account?.logged_in
    ? "/admin/dashboard"
    : loginPath(location.pathname, location.search);
  const buttonClass = "linen-nav-icon";
  return (
    <nav
      className="km-navbar linen-nav"
      aria-label={english ? "Main navigation" : "主导航"}
    >
      <Link to="/" className="linen-nav__brand" aria-label={siteName}>
        <span className="linen-nav__mark">
          <Activity size={17} strokeWidth={1.8} />
        </span>
        <span className="linen-nav__brand-copy">
          <strong>{siteName}</strong>
          <small>{english ? "NODE OPERATIONS" : "节点运行台"}</small>
        </span>
      </Link>
      <div className="linen-nav__right">
        <span className="linen-nav__live">
          <i />
          {english ? "LIVE" : "实时监控"}
        </span>
        <ThemeSwitch
          icon={
            <IconButton
              className={buttonClass}
              variant="ghost"
              title={t("common.appearance", "Appearance")}
              aria-label={t("common.appearance", "Appearance")}
            >
              <Sun size={16} />
            </IconButton>
          }
        />
        <ColorSwitch
          icon={
            <IconButton
              className={buttonClass}
              variant="ghost"
              title={t("common.color", "Accent color")}
              aria-label={t("common.color", "Accent color")}
            >
              <Palette size={16} />
            </IconButton>
          }
        />
        <LanguageSwitch
          icon={
            <IconButton
              className={buttonClass + " linen-nav-icon--language"}
              variant="ghost"
              title={t("common.language", "Language")}
              aria-label={t("common.language", "Language")}
            >
              <Languages size={16} />
            </IconButton>
          }
        />
        <a className="linen-nav__admin" href={destination}>
          <LogIn size={15} />
          <span>
            {account?.logged_in
              ? t("settings.title", "Settings")
              : t("login.title")}
          </span>
          <ChevronRight size={14} />
        </a>
      </div>
    </nav>
  );
};

const NavBarWithAccount = () => (
  <AccountProvider>
    <NavBar />
  </AccountProvider>
);

export default NavBarWithAccount;
