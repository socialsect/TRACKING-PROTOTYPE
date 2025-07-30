import React, { useEffect } from 'react';

const GolfLoader = ({ message = "Loading Camera..." }) => {
  useEffect(() => {
    const styleSheet = document.createElement('style');
    styleSheet.type = 'text/css';
    styleSheet.innerText = keyframeStyles;
    document.head.appendChild(styleSheet);
    return () => {
      document.head.removeChild(styleSheet);
    };
  }, []);

  return (
    <div style={styles.loaderOverlay}>
      <div style={styles.loaderContainer}>
        <div style={styles.golfBall}>
          <div style={styles.golfBallInner}>
            <div style={{ ...styles.dimple, top: '20%', left: '30%' }}></div>
            <div style={{ ...styles.dimple, top: '40%', left: '60%' }}></div>
            <div style={{ ...styles.dimple, top: '60%', left: '25%' }}></div>
            <div style={{ ...styles.dimple, top: '30%', left: '70%' }}></div>
            <div style={{ ...styles.dimple, top: '70%', left: '50%' }}></div>
            <div style={{ ...styles.dimple, top: '50%', left: '40%' }}></div>
          </div>
        </div>

        <div style={styles.puttingLine}>
          <div style={styles.puttingLineFill}></div>
        </div>

        <div style={styles.loadingText}>{message}</div>

        <div style={styles.progressDots}>
          <div style={{ ...styles.dot, animationDelay: '0s' }}></div>
          <div style={{ ...styles.dot, animationDelay: '0.2s' }}></div>
          <div style={{ ...styles.dot, animationDelay: '0.4s' }}></div>
        </div>
      </div>
    </div>
  );
};
const styles = {
  loaderOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
    fontFamily: 'Avenir, -apple-system, BlinkMacSystemFont, sans-serif',
  },

  loaderContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '30px',
  },

  golfBall: {
    width: '80px',
    height: '80px',
    borderRadius: '50%',
    background:
      'linear-gradient(135deg, #ffffff 0%, #f0f0f0 50%, #e0e0e0 100%)',
    boxShadow:
      '0 0 20px rgba(255, 255, 255, 0.3), inset -10px -10px 20px rgba(0, 0, 0, 0.1), inset 10px 10px 20px rgba(255, 255, 255, 0.8)',
    position: 'relative',
    animation: 'golfBallSpin 2s linear infinite, golfBallBounce 1.5s ease-in-out infinite alternate',
    overflow: 'hidden',
  },

  golfBallInner: {
    width: '100%',
    height: '100%',
    position: 'relative',
    borderRadius: '50%',
  },

  dimple: {
    position: 'absolute',
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
    boxShadow: 'inset 2px 2px 4px rgba(0, 0, 0, 0.3)',
  },

  puttingLine: {
    width: '200px',
    height: '4px',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: '2px',
    overflow: 'hidden',
    position: 'relative',
  },

  puttingLineFill: {
    height: '100%',
    width: '40px',
    background: 'linear-gradient(90deg, transparent, #CB0000, transparent)',
    borderRadius: '2px',
    animation: 'puttingLineSlide 2s ease-in-out infinite',
    boxShadow: '0 0 10px rgba(203, 0, 0, 0.5)',
  },

  loadingText: {
    color: '#ffffff',
    fontSize: '18px',
    fontWeight: '500',
    letterSpacing: '1px',
    textAlign: 'center',
    animation: 'textPulse 2s ease-in-out infinite',
  },

  progressDots: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },

  dot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: '#CB0000',
    animation: 'dotPulse 1.5s ease-in-out infinite',
    boxShadow: '0 0 8px rgba(203, 0, 0, 0.5)',
  },
};

const keyframeStyles = `
@keyframes golfBallSpin {
  0% { transform: rotate(0deg) translateY(0px); }
  25% { transform: rotate(90deg) translateY(-2px); }
  50% { transform: rotate(180deg) translateY(0px); }
  75% { transform: rotate(270deg) translateY(-2px); }
  100% { transform: rotate(360deg) translateY(0px); }
}

@keyframes golfBallBounce {
  0% { transform: scale(1) translateY(0px); }
  100% { transform: scale(1.05) translateY(-8px); }
}

@keyframes puttingLineSlide {
  0% { transform: translateX(-60px); }
  50% { transform: translateX(220px); }
  100% { transform: translateX(-60px); }
}

@keyframes textPulse {
  0%, 100% { opacity: 0.7; }
  50% { opacity: 1; }
}

@keyframes dotPulse {
  0%, 100% {
    transform: scale(1);
    opacity: 0.5;
  }
  50% {
    transform: scale(1.3);
    opacity: 1;
  }
}
`;

export default GolfLoader;
