sudo cp service/focalboard.service /etc/systemd/system/
cat /etc/systemd/system/focalboard.service
sudo systemctl enable focalboard.service
sudo systemctl start focalboard.service
sudo systemctl status focalboard.service

