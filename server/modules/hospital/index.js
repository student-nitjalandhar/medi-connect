const express = require('express');
const Hospital = require('../../models/hospital');
const User = require('../../models/user');

const router = express.Router();

// Create a new hospital
router.post('/', async (req, res) => {
    try {
        const hospital = new Hospital(req.body);
        await hospital.save();
        res.status(201).send(hospital);
    } catch (error) {
        res.status(400).send(error);
    }
});

// Get all hospitals with current appointments count
// Get all hospitals
router.get('/', async (req, res) =>  {
    const { searchQuery } = req.query;

    try {
        let hospitals;
        if (searchQuery) {
            // Search for hospitals by name or address using case-insensitive regex
            const regex = new RegExp(searchQuery, 'i');
            hospitals = await Hospital.find({
                $or: [
                    { name: { $regex: regex } },
                    { 'address.street': { $regex: regex } },
                    { 'address.city': { $regex: regex } },
                    { 'address.state': { $regex: regex } }
                ]
            });
        } else {
            hospitals = await Hospital.find();
        }

        res.status(200).json(hospitals);
    } catch (error) {
        console.error('Error fetching hospitals:', error);
        res.status(500).json({ message: 'Server error' });
    }
});
// Get a hospital by ID
router.get('/:id', async (req, res) => {
    try {
        const hospital = await Hospital.findById(req.params.id);
        if (!hospital) return res.status(404).send();
        res.send(hospital);
    } catch (error) {
        res.status(500).send(error);
    }
});

// Update a hospital
router.patch('/:id', async (req, res) => {
    try {
        const hospital = await Hospital.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!hospital) return res.status(404).send();
        res.send(hospital);
    } catch (error) {
        res.status(400).send(error);
    }
});

// Delete a hospital
router.delete('/:id', async (req, res) => {
    try {
        const hospital = await Hospital.findByIdAndDelete(req.params.id);
        if (!hospital) return res.status(404).send();
        res.send(hospital);
    } catch (error) {
        res.status(500).send(error);
    }
});



// Book an appointment
router.post('/hospitals/:id/book', async (req, res) => {
  try {
      const { userId, date, reason } = req.body;
      const hospitalId = req.params.id;

      const hospital = await Hospital.findById(hospitalId);
      const user = await User.findById(userId);

      if (!hospital || !user) {
          return res.status(404).json({ message: 'Hospital or user not found' });
      }

      // Create an appointment
      const appointment = {
          userId,
          date,
          reason,
          status: 'pending',
      };

      hospital.appointments.push(appointment);
      await hospital.save();

      // Add the appointment to the user's record as well
      user.appointments.push({ hospitalId, date, reason, status: 'pending' });
      await user.save();

      res.status(201).json({ message: 'Appointment booked successfully' });
  } catch (error) {
      res.status(500).json({ message: 'Error booking appointment', error });
  }
});
router.get('/appointments/:hospitalId', async (req, res) => {
    try {
        const hospital = await Hospital.findById(req.params.hospitalId).populate('appointments.userId', 'name email');
        if (!hospital) return res.status(404).send({ message: 'Hospital not found' });

        res.status(200).json(hospital.appointments);
    } catch (error) {
        res.status(500).send({ message: 'Server error', error });
    }
});

// Route to add a new appointment
router.post('/appointments/:hospitalId',async (req, res) => {
    try {
        const { userId, date, reason } = req.body;

        const hospital = await Hospital.findById(req.params.hospitalId);
        if (!hospital) return res.status(404).send({ message: 'Hospital not found' });

        const newAppointment = { userId, date, reason, status: 'pending' };
        hospital.appointments.push(newAppointment);
        await hospital.save();

        res.status(201).json(newAppointment);
    } catch (error) {
        res.status(500).send({ message: 'Server error', error });
    }
});

// Route to update an existing appointment
router.put('/appointments/:appointmentId', async (req, res) => {
    try {
        const { appointmentId } = req.params;
        const { date, reason, status } = req.body;

        const hospital = await Hospital.findOneAndUpdate(
            { 'appointments._id': appointmentId },
            {
                $set: {
                    'appointments.$.date': date,
                    'appointments.$.reason': reason,
                    'appointments.$.status': status
                }
            },
            { new: true }
        );

        if (!hospital) return res.status(404).send({ message: 'Appointment not found' });

        const updatedAppointment = hospital.appointments.id(appointmentId);
        res.status(200).json(updatedAppointment);
    } catch (error) {
        res.status(500).send({ message: 'Server error', error });
    }
});

router.delete('/appointments/:appointmentId', async (req, res) => {
    try {
        const { appointmentId } = req.params;
        console.log(`Attempting to delete appointment: ${appointmentId}`);

        // Step 1: Find the hospital with the appointment
        const hospital = await Hospital.findOne({ 'appointments._id': appointmentId });

        if (!hospital) {
            console.log('Hospital not found');
            return res.status(404).send({ message: 'Appointment not found in hospital records' });
        }

        // Step 2: Get the specific appointment to retrieve userId before deletion
        const appointmentToDelete = hospital.appointments.find(appointment => appointment._id.toString() === appointmentId);

        if (!appointmentToDelete) {
            console.log('Appointment not found in hospital');
            return res.status(404).send({ message: 'Appointment not found in hospital records' });
        }

        const userId = appointmentToDelete.userId;
        console.log(`UserId associated with appointment: ${userId}`);

        // Step 3: Delete the appointment from the hospital's records
        const updatedHospital = await Hospital.findOneAndUpdate(
            { 'appointments._id': appointmentId },
            { $pull: { appointments: { _id: appointmentId } } },
            { new: true }
        );

        console.log('Hospital update result:', updatedHospital ? 'Success' : 'Failed');

        // Step 4: Find the user and delete the appointment from user's records
        const updatedUser = await User.findOneAndUpdate(
            { _id: userId },
            { $pull: { appointments: { hospitalId: hospital._id, _id: appointmentId } } },
            { new: true }
        );

        console.log('User update result:', updatedUser ? 'Success' : 'Failed');

        if (!updatedUser) {
            console.log('User not found or appointment not in user records');
            return res.status(404).send({ message: 'User not found or appointment not in user records' });
        }

        res.status(200).json({ message: 'Appointment deleted from hospital and user records' });
    } catch (error) {
        console.error('Error deleting appointment:', error);
        res.status(500).send({ message: 'Server error', error: error.message });
    }
});

module.exports = router;
