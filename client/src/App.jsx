import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import JoinScreen from './JoinScreen';
import ChatRoom from './ChatRoom';

function App() {
  return (
    <Router>
      <div className="flex min-h-0 flex-1 flex-col">
        <Routes>
          <Route path="/" element={<JoinScreen />} />
          <Route path="/chat" element={<ChatRoom />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
