import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import { lazy, Suspense, type ComponentType } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";

const Home = lazy(() => import("./pages/Home"));
const Compositions = lazy(() => import("./pages/Compositions"));
const CompositionForm = lazy(() => import("./pages/CompositionForm"));
const Inputs = lazy(() => import("./pages/Inputs"));
const Categories = lazy(() => import("./pages/Categories"));
const Clients = lazy(() => import("./pages/Clients"));
const Projects = lazy(() => import("./pages/Projects"));
const ProjectForm = lazy(() => import("./pages/ProjectForm"));
const Budgets = lazy(() => import("./pages/Budgets"));
const BudgetForm = lazy(() => import("./pages/BudgetForm"));
const BudgetView = lazy(() => import("./pages/BudgetView"));
const BudgetDashboard = lazy(() => import("./pages/BudgetDashboard"));
const BudgetCharts = lazy(() => import("./pages/BudgetCharts"));
const BudgetGantt = lazy(() => import("./pages/BudgetGantt"));
const Financeiro = lazy(() => import("./pages/Financeiro"));
const BDICalculatorPage = lazy(() => import("./pages/BDICalculatorPage"));
const MaterialLists = lazy(() => import("./pages/MaterialLists"));
const MaterialListView = lazy(() => import("./pages/MaterialListView"));
const NotFound = lazy(() => import("@/pages/NotFound"));

function PageLoadingFallback() {
  return (
    <div className="flex h-screen w-full items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

function Router() {
  return (
    <Suspense fallback={<PageLoadingFallback />}>
      <Switch>
        <Route path={"/"} component={Home} />
        <Route path={"/compositions"} component={Compositions} />
        <Route path={"/compositions/new"} component={CompositionForm} />
        <Route path={"/compositions/:id"} component={CompositionForm} />
        <Route path={"/inputs"} component={Inputs} />
        <Route path={"/categories"} component={Categories} />
        <Route path={"/clients"} component={Clients} />
        <Route path={"/projects"} component={Projects} />
        <Route path={"/projects/new"} component={ProjectForm} />
        <Route path={"/projects/:id"} component={ProjectForm} />
        <Route path={"/budgets"} component={Budgets} />
        <Route path={"/budgets/new"} component={BudgetForm} />
        <Route path={"/budgets/:id"} component={BudgetDashboard} />
        <Route path={"/budgets/:id/view"} component={BudgetView} />
        <Route path={"/budgets/:id/edit"} component={BudgetForm} />
        <Route path={"/budgets/:id/charts"} component={BudgetCharts} />
        {/* BudgetGantt aceita um prop opcional stageTotalsWithBdi (usado só quando
            embutido dentro de BudgetForm) que o wouter não conhece — cast local
            evita conflito de tipos sem afetar a rota em si. */}
        <Route path={"/budgets/:id/gantt"} component={BudgetGantt as ComponentType<any>} />
        <Route path={"/financeiro"} component={Financeiro} />
        <Route path={"/bdi-calculator"} component={BDICalculatorPage} />
        <Route path={"/material-lists"} component={MaterialLists} />
        <Route path={"/material-lists/:id"} component={MaterialListView} />
        <Route path={"/404"} component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
