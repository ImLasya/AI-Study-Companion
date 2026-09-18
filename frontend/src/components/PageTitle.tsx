import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export const PageTitleUpdater: React.FC = () => {
  const location = useLocation();

  useEffect(() => {
    const path = location.pathname;
    const searchParams = new URLSearchParams(location.search);
    const tab = searchParams.get("tab");

    let title = "EduMind — Intelligent Learning Workspace";

    if (path === "/") {
      title = "EduMind — Intelligent Learning Workspace";
    } else if (path === "/signin" || path === "/login") {
      title = "EduMind — Sign In";
    } else if (path === "/signup") {
      title = "EduMind — Sign Up";
    } else if (path === "/dashboard") {
      title = "EduMind — Dashboard";
    } else if (path === "/spaces") {
      title = "EduMind — Learning Spaces";
    } else if (path.startsWith("/spaces/")) {
      title = "EduMind — Space Workspace";
    } else if (path.startsWith("/projects/")) {
      if (tab === "quiz") {
        title = "EduMind — Adaptive Quiz";
      } else if (tab === "tutor") {
        title = "EduMind — AI Tutor";
      } else if (tab === "growth") {
        title = "EduMind — Growth";
      } else if (tab === "flashcards") {
        title = "EduMind — Flashcards";
      } else if (tab === "materials") {
        title = "EduMind — Materials";
      } else if (tab === "analytics") {
        title = "EduMind — Analytics";
      } else {
        title = "EduMind — Project Workspace";
      }
    } else if (path === "/analytics") {
      title = "EduMind — Analytics";
    } else if (path === "/profile") {
      title = "EduMind — Profile";
    } else if (path === "/admin") {
      title = "EduMind — Admin";
    } else if (path === "/status") {
      title = "EduMind — System Status";
    }

    document.title = title;
  }, [location]);

  return null;
};
