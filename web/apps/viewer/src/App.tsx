import { Stage } from "./scene/Stage";
import { Inspector } from "./ui/Inspector";
import { Readout } from "./ui/Readout";

export default function App() {
  return (
    <div className="app">
      <Stage />
      <Inspector />
      <Readout />
    </div>
  );
}
