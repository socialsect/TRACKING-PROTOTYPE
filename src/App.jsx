import React, { useState } from "react";
import PuttAnalyzer from "./components/putt"; // your existing component
// import { PolishedPuttAnalyzer } from "./components/polished";

const App = () => {
//   const [isLoading, setIsLoading] = useState(true);
//   const [cameraError, setCameraError] = useState("");
//   const [analysisResult, setAnalysisResult] = useState(null);

  // Pass these states and handlers down to PuttAnalyzer or manage inside it

  return (
    // <PolishedPuttAnalyzer
    //   isLoading={isLoading}
    //   cameraError={cameraError}
    //   analysisResult={analysisResult}
    //   onReset={() => {
    //     setAnalysisResult(null);
    //     // reset other states as needed
    //   }}
    // >
    <PuttAnalyzer/>
    
    //   <PuttAnalyzer
        // pass props and handlers as needed
        // setIsLoading={setIsLoading}
        // setCameraError={setCameraError}
        // setAnalysisResult={setAnalysisResult}
    //   />/
    // </PolishedPuttAnalyzer>
  );
};

export default App;