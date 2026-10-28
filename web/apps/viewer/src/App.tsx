import { Stage } from "./scene/Stage";
import { Inspector } from "./ui/Inspector";
import { OpticsStrip } from "./ui/optics/OpticsStrip";
import { Readout } from "./ui/Readout";

export default function App() {
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
