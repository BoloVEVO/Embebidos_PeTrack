#ifndef COLLAR_MPU6050_H
#define COLLAR_MPU6050_H

namespace motion {
bool begin();
bool readInclination(float &degrees);
}

#endif
