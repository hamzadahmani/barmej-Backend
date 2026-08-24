import {Place, User} from '@prisma/client';

export const userDto = (u: User) => ({
  idUser: u.id,
  userMail: u.email,
  firstName: u.firstName,
  lastName: u.lastName,
  userName: u.firstName,
  userMobile: u.mobile,
  userGender: u.gender,
  userPhoto: u.photo,
  dateOfBirth: u.birthDate?.toISOString().slice(0, 10) ?? null,
  userRole: u.role.toLowerCase(),
  userLatitude: u.latitude,
  userLongtitude: u.longitude,
});

export const placeDto = (p: Place) => ({
  idPlace: p.id,
  idCategory: p.categoryId,
  placeName: p.name,
  subTitle: p.subtitle,
  image: p.image,
  latitude: p.latitude,
  longitude: p.longitude,
  horaire: p.schedule,
  placeAdress: p.address,
});

export const placeInfoDto = (p: Place) => ({
  placeTel: p.phone,
  placeAdress: p.address,
  placeMail: p.email,
  placeDescription: p.description,
  placeOutfit: p.outfit,
  placeMusicStyle: p.musicStyle,
  placeHappyHour: p.happyHour,
  horaire: p.schedule,
  placeFavorableDay: p.favorableDay,
  placeFavorableHour: p.favorableHour,
});
