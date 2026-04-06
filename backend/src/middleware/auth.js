const jwt = require('jsonwebtoken');

function auth(requiredRoles = []) {
  return (req, res, next) => {
    // Aceita token via cookie HttpOnly (produção) ou header Authorization (dev/ferramentas)
    const cookieToken = req.cookies?.authToken || null;
    const authHeader = req.headers.authorization || '';
    const headerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const token = cookieToken || headerToken;

    if (!token) {
      return res.status(401).json({ message: 'Token não informado.' });
    }

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      req.user = payload;

      if (requiredRoles.length && !requiredRoles.includes(payload.role)) {
        return res.status(403).json({ message: 'Sem permissão para esta ação.' });
      }

      next();
    } catch (error) {
      return res.status(401).json({ message: 'Token inválido.' });
    }
  };
}

module.exports = auth;
