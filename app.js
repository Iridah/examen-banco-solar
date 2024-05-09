const express = require('express');
const chalk = require('chalk');
const { Pool } = require('pg');
const moment = require('moment'); // Formato de fecha en transferencias

const app = express();
const port = process.env.PORT || 3000;

// Datos de la BBDD
const pool = new Pool({
  user: 'planta',
  host: 'localhost',
  database: 'banco_solar',
  password: 'macetero',
  port: 5432,
});

// Crear la tabla de usuarios
(async () => {
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL UNIQUE PRIMARY KEY,
      nombre VARCHAR(255) NOT NULL,
      balance DECIMAL(10,2) NOT NULL DEFAULT 0.00
    )`);
  } catch (error) {
    console.error(chalk.red('Error creando la tabla de usuarios:', error));
  }
})();

// Entrega la tabla HTML del cliente
app.use(express.static('public'));

// Analizar archivos JSON
app.use(express.json());

// Ruta para aplicaciones del cliente (GET /)
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// Ruta para crear usuarios (POST /usuario)
app.post('/usuario', async (req, res) => {
  const { nombre, balance } = req.body;

  try {
    const client = await pool.connect();
    await client.query('INSERT INTO usuarios (nombre, balance) VALUES ($1, $2)', [nombre, balance]);
    await client.release();
    res.status(201).send({ message: 'Usuario creado exitosamente!' });
  } catch (error) {
    console.error(chalk.red('Error creando usuario:', error));
    res.status(500).send({ message: 'Error creando usuario' });
  }
});

// Ruta para recuperar la lista de usuarios (GET /usuarios)
app.get('/usuarios', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT * FROM usuarios');
    const users = result.rows;
    await client.release();
    res.json(users);
  } catch (error) {
    console.error(chalk.red('Error recuperando usuarios:', error));
    res.status(500).send({ message: 'Error recuperando usuarios' });
  }
});

/// Ruta de actualizacion de usuarios (PUT /usuario?id=...)
app.put('/usuario', async (req, res) => {
    const { id, nombre, balance } = req.query; // Parametros desde la query
  
    if (!id) {
      res.status(400).send({ message: 'Falta el ID del usuario' });
      return; // Devuelve si la ID no esta presente
    }
  
    try {
      const client = await pool.connect(); // Conexion a la base
      await client.query('UPDATE usuarios SET nombre = $1, balance = $2 WHERE id = $3', [nombre, balance, id]); // Actualiza querie
      await client.release(); // Libera la conexion a la base
  
      res.status(200).send({ message: 'Usuario actualizado exitosamente!' }); // Envia respuesta exitosa
    } catch (error) {
      console.error(chalk.red('Error updating user:', error));
      res.status(500).send({ message: 'Error actualizando usuario' }); // Envia respuesta erronea
    }
  });

// Ruta para borrar un usuario (DELETE /usuario?id=...)
app.delete('/usuario', async (req, res) => {
    const { id } = req.query; // Obtiene la ID desde la query
  
    if (!id) {
      res.status(400).send({ message: 'Falta el ID del usuario' });
      return; // Devuelve si la ID no esta presente
    }
  
    try {
      const client = await pool.connect(); // Conexion a la base
      await client.query('DELETE FROM usuarios WHERE id = $1', [id]); // Borra la query
      await client.release(); // Libera la conexion a la base
  
      res.status(200).send({ message: 'Usuario eliminado exitosamente!' }); // Envia respuesta exitosa
    } catch (error) {
      console.error(chalk.red('Error deleting user:', error));
      res.status(500).send({ message: 'Error eliminando usuario' }); // Envia respuesta erronea
    }
  });

// Ruta para gestionar las transferencias (POST /transferencia)
app.post('/transferencia', async (req, res) => {
    const { emisor, receptor, monto } = req.body; // Obtener la data desde el HTML del cliente
  
    if (!emisor || !receptor || !monto) {
      res.status(400).send({ message: 'Faltan datos para la transferencia' });
      return; // Regresa si falta algun dato
    }
  
    try {
      const client = await pool.connect(); // Conexion a la base
      // Comienza la transaccion, con integridad de datos
      await client.query('BEGIN');
  
      // Revision de saldos
      const emisorBalanceResult = await client.query('SELECT balance FROM usuarios WHERE nombre = $1', [emisor]);
      const emisorBalance = emisorBalanceResult.rows[0].balance;
      if (emisorBalance < monto) {
        await client.query('ROLLBACK');
        res.status(400).send({ message: 'El emisor no tiene suficiente saldo' });
        return;
      }
  
      // Actualiza los fondos del emisor
      await client.query('UPDATE usuarios SET balance = balance - $1 WHERE nombre = $2', [monto, emisor]);
  
      // Actualiza los fondos del receptor
      await client.query('UPDATE usuarios SET balance = balance + $1 WHERE nombre = $2', [monto, receptor]);
  
      // Ingresa registro de transaccion
      await client.query('INSERT INTO transferencias (emisor, receptor, monto) VALUES ($1, $2, $3)', [emisor, receptor, monto]);
  
      // Commit en el SQL si la transaccion es exitosa
      await client.query('COMMIT');
      await client.release(); // Libera la conexion a la base
  
      res.status(201).send({ message: 'Transferencia realizada exitosamente!' }); // Envia respuesta exitosa
    } catch (error) {
      console.error(chalk.red('Error gestionando la transaccion:', error));
      await client.query('ROLLBACK'); // Rollback en caso de error
      await client.release(); // Libera la conexion a la base
      res.status(500).send({ message: 'Error realizando transferencia' }); // Envia respuesta erronea
    }
  });

// Ruta para recuperar todas las transferencias (GET /transferencias)
app.get('/transferencias', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT * FROM transferencias');
    const transfers = result.rows;
    await client.release();

    // Formato de fechas usando moment
    transfers.forEach((transfer) => {
      transfer.fecha = formatDate(transfer.fecha);
    });

    res.json(transfers);
  } catch (error) {
    console.error(chalk.red('Error fetching transfers:', error));
    res.status(500).send({ message: 'Error obteniendo transferencias' });
  }
});

// Formato para las fechas en las transferencias
const formatDate = (date) => {
  const dateFormat = moment(date).format('L');
  const timeFormat = moment(date).format('LTS');
  return `${dateFormat} ${timeFormat}`;
};

// Inicializar el servidor
app.listen(port, () => {
  console.log(chalk.green(`Server started on port ${port}`));
});

