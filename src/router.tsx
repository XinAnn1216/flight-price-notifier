import { createBrowserRouter, type RouteObject } from "react-router";

import { RootComponent, ErrorComponent, NotFoundComponent } from "./routes/root";
import { authenticatedLoader } from "./routes/authenticated";
import { Index } from "./routes/index";
import { SignIn } from "./routes/signin";
import { SignUp } from "./routes/signup";
import { AppPage } from "./routes/app";

export const routes: RouteObject[] = [
  {
    path: "/",
    Component: RootComponent,
    ErrorBoundary: ErrorComponent,
    HydrateFallback: () => null,
    children: [
      { index: true, Component: Index },
      { path: "signin", Component: SignIn },
      { path: "signup", Component: SignUp },
      {
        id: "authenticated",
        loader: authenticatedLoader,
        children: [{ path: "app", Component: AppPage }],
      },
      { path: "*", Component: NotFoundComponent },
    ],
  },
];

export const router = createBrowserRouter(routes);
