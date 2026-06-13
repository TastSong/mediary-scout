import Link from "next/link";
import { Bell, Film, Library, Settings } from "lucide-react";
import { SearchNavLink } from "./search-memory";

export function AppSidebar({
  active,
  searchQuery = "",
}: {
  active: "search" | "library" | "notifications" | "settings" | "none";
  searchQuery?: string;
}) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">
          <Film size={18} aria-hidden />
        </span>
        <span className="brand-copy">
          <strong>Media Track</strong>
          <span>115 library ops</span>
        </span>
      </div>

      <nav aria-label="主导航">
        <ul className="nav-list">
          <li>
            <SearchNavLink active={active === "search"} knownQuery={searchQuery} />
          </li>
          <li>
            <Link
              className={`nav-item ${active === "library" ? "is-active" : ""}`}
              href="/?tab=library"
            >
              <Library size={16} aria-hidden />
              媒体库
            </Link>
          </li>
          <li>
            <Link
              className={`nav-item ${active === "notifications" ? "is-active" : ""}`}
              href="/notifications"
            >
              <Bell size={16} aria-hidden />
              通知
            </Link>
          </li>
          {/* The desktop sidebar puts 设置 in the footer card; on the mobile top
              bar that footer is hidden, so surface 设置 as a nav item there. */}
          <li className="nav-settings-item">
            <Link
              className={`nav-item ${active === "settings" ? "is-active" : ""}`}
              href="/settings"
            >
              <Settings size={16} aria-hidden />
              设置
            </Link>
          </li>
        </ul>
      </nav>

      <div className="sidebar-footer">
        <Link className="health-card" href="/settings" style={{ textDecoration: "none", color: "inherit" }}>
          <span className="health-icon">
            <Settings size={16} aria-hidden />
          </span>
          <span>
            <strong>设置</strong>
            <span>115 连接 · 推送 · 偏好</span>
          </span>
        </Link>
      </div>
    </aside>
  );
}
