import { Stage } from "./scene/Stage";
import { Inspector } from "./ui/Inspector";
import { OpticsStrip } from "./ui/optics/OpticsStrip";
import { Readout } from "./ui/Readout";
import { useThemeAttribute } from "./ui/ThemeToggle";

export default function App() {
  useThemeAttribute();
  return (
    <div className="app">
      <Stage />
      <OpticsStrip />
      <div className="side">
        <Inspector />
        <Readout />
      </div>
    </div>
  );
}
