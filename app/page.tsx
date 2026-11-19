import HomeLanding from "./HomeLanding";
import { homeDesign } from "../src/platform/home-design";

export default function Page() {
  return <HomeLanding values={homeDesign()} />;
}
