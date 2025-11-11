import React from 'react';

export const LoadingBar: React.FC = () => {
 return (
  <div className="relative w-full h-1 bg-gray-200 overflow-hidden rounded-full">
   <div className="absolute h-full bg-gradient-to-r from-blue-400 via-blue-600 to-blue-400 animate-loading-bar"
    style={{
     width: '40%',
     animation: 'loading-bar 1.5s ease-in-out infinite'
    }}
   />
   <style jsx>{`
                @keyframes loading-bar {
                    0% {
                        transform: translateX(-100%);
                    }
                    100% {
                        transform: translateX(350%);
                    }
                }
                .animate-loading-bar {
                    animation: loading-bar 1.5s ease-in-out infinite;
                }
            `}</style>
  </div>
 );
};
