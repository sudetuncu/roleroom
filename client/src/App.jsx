import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import JoinScreen from './JoinScreen';
import ChatRoom from './ChatRoom';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<JoinScreen />} />
        <Route path="/chat" element={<ChatRoom />} />
      </Routes>
    </Router>
  );
}

export default App;
